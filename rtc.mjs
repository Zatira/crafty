//@ts-check
import { displayModal, fieldFn, n } from "./dom.mjs";
import { signal } from "./signals.mjs";

export const connection = {
    online: signal(false),
    peerState: signal('offline'),
    signaling: "zeus-olympus.fly.dev",
    useStun: true,
    stun: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    },
    roomId: ""
}
//@ts-ignore
window.rtcc = connection

export async function updateRtc(data) {
    if (!channel) {
        console.log("no channel -> dont send")
        connection.online.value = false
        return
    }
    if (!connection.online.value) {
        console.log("connection marked as offline -> dont send")
        connection.online.value = false
        return
    }
    if (channel.readyState == 'open') {
        try {
            const encoded = new TextEncoder().encode(data);
            const cs = new CompressionStream("deflate")
            const writer = cs.writable.getWriter()
            writer.write(encoded)
            writer.close()
            const blb = await new Response(cs.readable).blob()
            channel.send(blb)
            console.log('bytes sent', blb.size)
        } catch (e) {
            console.log('send error', e)
        }
    }
}

export const rtcUpdates = signal()
let channel
let ws
let pc

async function tryConnect() {
    // if (window.location.href.indexOf("localhost") > -1) {
    //     return
    // }
    if (ws && ws.readyState != WebSocket.CLOSED) {
        await ws.close()
    }
    if (pc) {
        connection.online.value = false
        pc.close()
    }
    ws = new WebSocket(`wss:////${connection.signaling}`);
    pc = connection.useStun ? new RTCPeerConnection(connection.stun) : new RTCPeerConnection();

    // Create data channel if first peer
    pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ desc: pc.localDescription, roomId: connection.roomId }));
    };

    pc.ondatachannel = (event) => {
        console.log('max msg size', pc?.sctp?.maxMessageSize)
        channel = event.channel;
        setupChannel(channel);
        connection.online.value = true
        ws.close()
    };

    pc.oniceconnectionstatechange = (event) => {
        console.log(event)
        const state = event?.target?.connectionState
        if (state != "connected") {
            console.log("statechange", state)
            connection.online.value = false
            if (state == "disconnected" || state == "failed") {
                console.log("closing")
                pc.close()
            }
        }
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ candidate: event.candidate, roomId: connection.roomId }));
        }
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (!connection.roomId) {
            console.log("no room id")
            return
        }
        if (msg.roomId != connection.roomId) {
            console.log("room id mismatch", msg.roomId)
            return
        }
        console.log("message for room", msg.roomId)
        if (msg.type == "ready") {
            connection.peerState.value = "ready"
            console.log("ready")
            ws.send(JSON.stringify({ roomId: connection.roomId, type: "confirm" }))
        }
        if (msg.type == "confirm") {
            connection.peerState.value = "ready"
            console.log("confirm")
        }

        if (msg.desc) {
            if (msg.desc.type === "offer") {
                await pc.setRemoteDescription(msg.desc);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                ws.send(JSON.stringify({ desc: pc.localDescription, roomId: connection.roomId }));
            } else if (msg.desc.type === "answer") {
                await pc.setRemoteDescription(msg.desc);
            }
        }

        if (msg.candidate) {
            try {
                await pc.addIceCandidate(msg.candidate);
            } catch (e) {
                console.error(e);
                connection.online.value = false
            }
        }
    };

    // Start connection when WebSocket opens
    ws.onopen = () => {
        ws.send(JSON.stringify({ roomId: connection.roomId, type: "ready" }))
        connection.peerState.value = "signaling"
    };
}

function setupChannel(channelToSetup) {
    channelToSetup.onmessage = async (e) => {
        console.log('received a message')
        try {
            console.log('bytes received', e.data.byteLength)
            const ds = new DecompressionStream("deflate")
            const writer = ds.writable.getWriter()
            writer.write(e.data)
            writer.close()
            const content = await new Response(ds.readable).text()
            rtcUpdates.value = content
        } catch (e) {
            console.log('receive error', e)
        }
    };
    channelToSetup.onopen = () => onSendChannelStateChange(channelToSetup);
    channelToSetup.onclose = () => onSendChannelStateChange(channelToSetup);
}

function onSendChannelStateChange(sendChannel) {
    const readyState = sendChannel.readyState;
    console.log('Send channel state is: ' + readyState);
    if (readyState === 'open') {
        connection.online.value = true
    }
    if (readyState === 'closed') {
        connection.online.value = false
        connection.peerState.value = "offline"
    }
}

function start() {
    channel = pc.createDataChannel("sync");
    setupChannel(channel);
}

function connectionDialog() {
    const status = n('span', [connection.online.value ? 'online' : 'offline'])
    connection.online.subscribe(() => status.innerText = connection.online.value ? 'online' : 'offline')
    const peer = n('span', [connection.peerState.value])
    connection.peerState.subscribe(() => peer.innerText = connection.peerState.value)
    displayModal(n('div', [
        n('h1', ["Vebindung"]),
        n('p', ["connection: ", status]),
        n('p', ["peer: ", peer]),
        fieldFn("Server", {
            $change: (ev) => {
                connection.signaling = ev.target.value
            },
            value: connection.signaling
        }),
        fieldFn("Room", {
            $change: (ev) => {
                connection.roomId = ev.target.value
            },
            value: connection.roomId
        }),
        n('button', ['connect'], { $click: () => tryConnect() }),
        n('button', ['start'], { $click: () => start() }),
        n('div',
            [
                n('button', ['Abbrechen'], { $click: (event) => event.target.closest('dialog').close() })
            ], {
            style: "display: flex; justify-content:end; margin-top:10px;"
        }
        )
    ], { style: "padding:5px; min-width: 300px;" }))
}

const indicator = n('div', [], { style: "width: 16px; height:16px; border-radius: 20px; background: var(--indicator, green); box-shadow: 0px 0px 5px var(--indicator, green); border: 1px solid white;" })
const container = n('div', [indicator], { style: "position: fixed; bottom:-4px; right:-4px; padding: 5px; border-radius: 10px 0px 0px 0px; border: 1px solid var(--color-text); background:var(--color-bg)", $click: connectionDialog })
document.body.appendChild(container)

function updateIndicator(online) {
    if (online) {
        indicator.style.setProperty("--indicator", "green")
        indicator.title = "connected"
    } else {
        indicator.style.setProperty("--indicator", "red")
        indicator.title = "disconnected"
    }
}

updateIndicator(connection.online.value)
connection.online.subscribe((online) => updateIndicator(online))