//@ts-check
import { displayModal, fieldFn, n } from "./dom.mjs";
import { signal } from "./signals.mjs";

export const connection = {
    online: signal(false),
    signaling: "zeus-olympus.fly.dev",
    useStun: true,
    stun: {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    }
}
window.rtcc = connection

export function updateRtc(data) {
    if (!channel || !connection.online) {
        connection.online.value = false
        return
    }
    if (channel.readyState == 'open') {
        channel.send(data)
    }
}

export const rtcUpdates = signal()
let channel
let ws

async function tryConnect() {
    if (ws) {
        await ws.close()
    }
    ws = new WebSocket(`wss:////${connection.signaling}`);
    const pc = connection.useStun ? new RTCPeerConnection(connection.stun) : new RTCPeerConnection();

    // Create data channel if first peer
    pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ desc: pc.localDescription }));
    };

    pc.ondatachannel = (event) => {
        channel = event.channel;
        setupChannel(channel);
        connection.online.value = true
        ws.close()
    };

    pc.oniceconnectionstatechange = (event) => {
        console.log(event)
        if (event?.target?.connectionState == "failed") {
            connection.online.value = false
            pc.close()
        }
    }

    function setupChannel(channel) {
        channel.onmessage = (e) => {
            //console.log(e)
            rtcUpdates.value = e.data
        };
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ candidate: event.candidate }));
        }
    };

    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.desc) {
            if (msg.desc.type === "offer") {
                await pc.setRemoteDescription(msg.desc);

                channel = pc.createDataChannel("sync");
                setupChannel(channel);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                ws.send(JSON.stringify({ desc: pc.localDescription }));
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
        // Try to become initiator
        channel = pc.createDataChannel("sync");
        setupChannel(channel);
    };
}

function connectionDialog() {
    const status = n('p', [connection.online.value ? 'online' : 'offline'])
    connection.online.subscribe(() => status.innerText = connection.online.value ? 'online' : 'offline')
    displayModal(n('div', [
        n('h1', ["Vebindung"]),
        status,
        fieldFn("Server", {
            $change: (ev) => {
                connection.signaling = ev.target.value
                tryConnect()
            },
            value: connection.signaling
        }),
        n('button', ['connect'], { $click: tryConnect }),

    ]))
}

const indicator = n('div', [], { style: "width: 16px; height:16px; border-radius: 20px; background: var(--indicator, green); box-shadow: 0px 0px 5px var(--indicator, green); border: 1px solid white;" })
const container = n('div', [indicator], { style: "position: fixed; bottom:-4px; right:-4px; padding: 5px; border-radius: 10px 0px 0px 0px; border: 1px solid var(--color-text); background:var(--color-bg)", $click: connectionDialog })
document.body.appendChild(container)

function updateIndicator() {
    if (connection.online.value) {
        indicator.style.setProperty("--indicator", "green")
        indicator.title = "connected"
    } else {
        indicator.style.setProperty("--indicator", "red")
        indicator.title = "disconnected"
    }
}

updateIndicator()
connection.online.subscribe(() => updateIndicator())
tryConnect()