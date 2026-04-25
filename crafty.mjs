//@ts-check
import { displayModal, fieldFn, n } from "./dom.mjs"
import { connection, rtcUpdates, updateRtc } from "./rtc.mjs"
import { deserialize, serialize } from "./ser.mjs"
import { signal } from "./signals.mjs"

/**
 * @template T
 * @typedef {import('./signals.mjs').Signal<T>} Signal
 */

//@ts-ignore
window.loadFile = loadFile
//@ts-ignore
window.loadMeta = loadMeta
//@ts-ignore
window.init = init
//@ts-ignore
window.noi = noi
//@ts-ignore
window.openDialog = openDialog
//@ts-ignore
window.save = save
//@ts-ignore
window.addRecipe = addRecipe
//@ts-ignore
window.addFactory = addFactory
//@ts-ignore
window.addMaterial = addMaterial

//@ts-ignore
const L = window.L

const defaultConfig = {
    updated: 0,
    markers: [],
    recipes: [],
    factories: [],
    materials: [],
    todo: [],
    game: '',
}


const machineMeta = new Map([
    ["PackageSender", { icon: "b-icon sender-icon", name: "Sender" }],
    ["PackageReceiver", { icon: "b-icon receiver-icon", name: "Empfänger" }],
    ["BaseCore", { icon: "b-icon core-icon", name: "Basis" }],
    ["Teleporter", { icon: "b-icon tp-icon", name: "Teleporter" }],
    ["ZipRail", { icon: "b-icon zip-icon", name: "Zipline" }],
    ["ZiplineVariants", { icon: "b-icon zip-icon", name: "Zipline" }],
])

const translation = new Map([
    ["CR_TitaniumOreImpure_MechanicalDrill", "Titan 1/s"],
    ["CR_WolframOreImpure_MechanicalDrill", "Wolfram 1/s"],
    ["CR_CalciumOreImpure_MechanicalDrill", "Kalzium 1/s"],
    ["CR_TitaniumOre_MechanicalDrill", "Titan 2/s"],
    ["CR_WolframOre_MechanicalDrill", "Wolfram 2/s"],
    ["CR_CalciumOre_MechanicalDrill", "Kalzium 2/s"],
    ["CR_TitaniumOrePure_MechanicalDrill", "Titan 4/s"],
    ["CR_WolframOrePure_MechanicalDrill", "Wolfram 4/s"],
    ["CR_CalciumOrePure_MechanicalDrill", "Kalzium 4/s"],
    ["CR_BasicBuildingMaterial", "Material Grau"],
    ["CR_IntermediateBuildingMaterial", "Material Gelb"],
    ["CR_GoethiteOre_LaserDrill", "Göthit"],


    ["AcidExtractor", "Extraktor"],
    ["MechanicalDrill", "Bergwerk"],
    ["BaseCore", "Basis"],
    ["PackageSender", "Sender"],
    ["PackageReceiver", "Empfänger"],
    ["ZipRail", "Zipline"],
    ["ZiplineVariants", "Zipline"],
    ["Furnace", "Schmelzhütte"],
    ["Smelter", "Schmelzofen"]
])

/**
 * @typedef {Object} Route
 * @property {string} type
 * @property {number|null} id
 */

/**
 * Material type definition
 * @typedef {Object} Material
 * @property {string} name
 * @property {string} [internalId]
 * @property {number} id
 */

/**
 * Factory type definition
 * @typedef {Object} Factory
 * @property {string} name
 * @property {string} [internalId]
 * @property {number} heat
 * @property {number} power
 * @property {number} id
 */

/**
 * Recipe type definition
 * @typedef {Object} Recipe
 * @property {string} name
 * @property {string} [internalId]
 * @property {number} id
 * @property {number} materialId
 * @property {number} factoryId
 * @property {number} quantity
 * @property {number} time
 * @property {Ingredient[]} ingredients
 */

/**
 * Config type definition
 * @typedef {Object} Ingredient
 * @property {number} id
 * @property {number} amount
 */

/**
 * Config type definition
 * @typedef {Object} Config
 * @property {Recipe[]} recipes
 * @property {Factory[]} factories
 * @property {Material[]} materials
 * @property {any[]} markers
 * @property {any[]} todo
 * @property {number} updated
 * @property {string} game
 */

/**
* State type definition
* @typedef {Object} State
* @property {string | null} configName
* @property {Config} config
* @property {Config} _config
*/

/** @type {State} */
const state = {
    _config: structuredClone(defaultConfig),
    configName: null,
    set config(config) {
        this._config = { ...config }
        updateTranslations(this._config)
        displayConfig()
        configSignal.value = this._config
    },
    get config() {
        return this._config
    }
}

/**
 * 
 * @param {Config} config 
 */
function updateTranslations(config) {
    config.materials.filter(m => m.internalId).forEach(m => translation.set(m.internalId, m.name))
    config.factories.filter(m => m.internalId).forEach(m => {
        if (m.internalId) {
            translation.set(m.internalId, m.name)
            translation.set(m.internalId.replace("DA_", ""), m.name)
        }
    })
    config.recipes.filter(m => m.internalId).forEach(m => translation.set(m.internalId, m.name))
}

function updateLocalConfig(config) {
    config.updated = new Date().getTime()
    state.config = config
}

function config() {
    return state.config
}

const configSignal = signal()
configSignal.subscribe((cfg) => {
    saveInternal(cfg)
    if (connection.online) {
        updateRtc(serialize(cfg))
    }
})

connection.online.subscribe((online) => {
    if (online) {
        updateRtc(serialize(config()))
    }
})

rtcUpdates.subscribe((v) => {
    const des = deserialize(v)
    if (config().game === des.game && des.updated > config().updated) {
        state.config = des
    }
})

async function loadFile(event) {
    const formData = new FormData(event.target)
    const filehandle = formData.get("cfg")
    if (!filehandle || typeof filehandle === "string") {
        return
    }
    const content = await filehandle.text()
    readInfo(content, filehandle.name)
}

async function loadMeta(event) {
    const formData = new FormData(event.target)
    const filehandle = formData.get("meta")
    if (!filehandle || typeof filehandle === "string") {
        return
    }
    const content = await filehandle.text()
    readMeta(content, filehandle.name)
}

function readMeta(meta, name) {
    config().recipes = []
    config().materials = []
    config().factories = []
    const parsedMeta = JSON.parse(meta)
    const materials = parsedMeta.filter(e => e.type == "material")
    const recipeMaterialLink = new Map()
    materials.forEach(m => {
        const existingMaterial = config().materials.find(em => em.internalId == m.internalId)
        if (existingMaterial) {
            Object.assign(existingMaterial, m)
            recipeMaterialLink.set(existingMaterial.internalId, existingMaterial.id)
        } else {
            upsert(config().materials, m, null)
            recipeMaterialLink.set(m.internalId, m.id)
        }
    })
    const factories = parsedMeta.filter(e => e.type == "factory")
    const recipeFactoryLink = new Map()
    factories.forEach(f => {
        const existingFactory = config().factories.find(ef => ef.internalId == f.internalId)
        if (existingFactory) {
            Object.assign(existingFactory, f)
            f.recipes?.forEach(r => {
                recipeFactoryLink.set(r, existingFactory.id)
            })
        } else {
            upsert(config().factories, f, null)
            f.recipes?.forEach(r => {
                recipeFactoryLink.set(r, f.id)
            })
        }
    })
    const recipes = parsedMeta.filter(e => e.type == "recipe")
    recipes.forEach(r => {
        if (!r.name) {
            console.log('recipe without name:', r)
            return
        }
        const existingRecipe = config().recipes.find(er => er.internalId == r.internalId)
        if (existingRecipe) {
            Object.assign(existingRecipe, r)
            existingRecipe.factoryId = recipeFactoryLink.get(r.internalId)
            existingRecipe.ingredients?.forEach(i => {
                const id = recipeMaterialLink.get(i.id)
                if (id !== 0 && !id) {
                    console.log('missing material for recipe:', id, i.id)
                    return
                }
                i.id = id
            })
            existingRecipe.unlock?.forEach(i => {
                const id = recipeMaterialLink.get(i.id)
                if (id !== 0 && !id) {
                    console.log('missing material for recipe:', id, i.id)
                    return
                }
                i.id = id
            })
            existingRecipe.materialId = recipeMaterialLink.get(r.output)
        } else {
            upsert(config().recipes, r, null)
            r.factoryId = recipeFactoryLink.get(r.internalId)
            r.ingredients?.forEach(i => {
                const id = recipeMaterialLink.get(i.id)
                if (id !== 0 && !id) {
                    console.log('missing material for recipe:', id, i.id)
                    return
                }
                i.id = id
            })
            r.unlock?.forEach(i => {
                const id = recipeMaterialLink.get(i.id)
                if (id !== 0 && !id) {
                    console.log('missing material for recipe:', id, i.id)
                    return
                }
                i.id = id
            })
            r.materialId = recipeMaterialLink.get(r.output)
        }
    })
    updateLocalConfig(config())
    saveInternal(config())
}

function readInfo(configContent, name) {
    try {
        const parsedConfig = deserialize(configContent)
        state.config = Object.assign(structuredClone(defaultConfig), parsedConfig)
        state.configName = name
    } catch (e) {
        console.error(e)
        alert("failed to read config")
        return
    }
}
let mapTipMap;
let mapTipElement;
function init() {
    const fromStorage = localStorage.getItem(key())
    if (fromStorage) {
        const [parsedConfig, configName] = deserialize(fromStorage)
        const tempCfg = Object.assign(structuredClone(defaultConfig), parsedConfig);
        if (tempCfg.materials.length == 0 && tempCfg.recipes.length > 0) {
            synthMaterials(tempCfg)
        }
        tempCfg.materials.sort((a, b) => a.name.localeCompare(b.name))
        tempCfg.factories.sort((a, b) => a.name.localeCompare(b.name))
        tempCfg.recipes.sort((a, b) => a.name.localeCompare(b.name))
        state.config = tempCfg;
        state.configName = configName
    }
    hookIntoNav()
    navigate(new URL(window.location.href))
    mapTipElement = n('div', [], { id: 'maptip-map', width: 200, height: 200, style: "position:absolute; opacity:0; top:0; left:0; width:200px; height:200px;" })
    document.body.append(mapTipElement)
    mapTipMap = L.map('maptip-map', {
        crs: L.CRS.Simple,
        minZoom: 4,
        maxZoom: 4,
        zoomControl: false
    })
    setTimeout(() => {
        mapTipElement.style.display = "none"
        mapTipElement.style.opacity = 1
    }, 100);

    L.tileLayer('./tiles/{z}/{x}_{y}.webp', {
        noWrap: true
    }).addTo(mapTipMap);

    mapTipMap.setView([-140, 70], 4);
}

/**
 * 
 * @param {Config} config
 * @returns 
 */
function synthMaterials(config) {
    for (const recipe of config.recipes) {
        /**@type Material */
        const newMat = { name: recipe.name, id: recipe.id }
        config.materials.push(newMat)
        recipe.materialId = newMat.id
    }
}

function navigate(url, shouldScroll = true) {
    const hash = url.hash
    if (hash && hash.startsWith("#")) {
        const sansPound = hash.substring(1)
        if (sansPound.indexOf("/") == -1) {
            route.value = { type: sansPound, id: null }
            renderMain(sansPound, null)
            if (sansPound == 'map') {
                const root = document.querySelector('outlet')
                if (root && shouldScroll) {
                    root.scrollIntoView()
                    return
                }
            }
        } else {
            const type = sansPound.substring(0, sansPound.indexOf("/"))
            const id = hash.substring(hash.indexOf("/") + 1, hash.indexOf("-"))
            route.value = { type, id }
            renderMain(type, id)
            if (type == 'recipe' || type == 'factory' || type == 'map') {
                const root = document.querySelector('outlet')
                if (root && shouldScroll) {
                    root.scrollIntoView()
                    return
                }
            }
        }
    }
    if (shouldScroll) {
        document.scrollingElement && (document.scrollingElement.scrollTop = 0)
    }
}

function renderMain(type, id) {
    const rootElementName = 'outlet'
    const root = document.querySelector(rootElementName)
    if (!root) {
        console.error("missing root node", rootElementName)
        alert("failed render")
        return
    }
    const node = mainNodeByType(type, id)
    if (!node) {
        return
    }
    root.innerHTML = ''
    if (Array.isArray(node)) {
        root.append(...node)
    } else {
        root.append(node)
    }
}

function mainNodeByType(type, id) {
    switch (type) {
        case 'factory':
            return id == null ? renderFactoryList() : renderFactory(id)
        case 'recipe':
            return id == null ? renderRecipeList() : renderRecipe(id)
        case 'material':
            return id == null ? renderMaterialList() : renderMaterial(id)
        case 'tree':
            return renderTechTree()
        case 'map':
            break;
        case 'todo':
            break;
        default:
            return renderOops()
    }
}

class TodoComponent {
    element;
    attached = false;
    /**
     * 
     * @param {Signal<Route>} route
     * @param {Element} outlet
     */
    constructor(route, outlet) {
        this.outlet = outlet
        route.subscribe((route) => {
            if (route.type == "todo") {
                this.attach(route)
            } else {
                this.detach()
            }
        })

    }
    attachCallbacks = []
    attach(route) {
        if (!this.attached) {
            if (!this.element) {
                this.element = this.render()
            }
            this.outlet.replaceChildren(this.element)
        }
        this.attachCallbacks.forEach(cb => cb(route.id))
        this.attached = true
    }
    detachCallbacks = []
    detach() {
        this.detachCallbacks.forEach(cb => cb())
        this.attached = false
    }
    render() {
        return renderToDo(this.detachCallbacks)
    }
}

function renderToDo(detachCallbacks) {
    detachCallbacks.push(
        () => editingSignal.value = null
    )
    const editingSignal = signal({})
    const titleInput = n('input', [], {
        value: "",
        required: true,
        style: "margin: 0; flex-grow: 1"
    });
    const submitButton = n('button', ['✅'], {
        type: 'submit'
    })
    /** @type {HTMLFormElement} */
    const newItem = n('form', [
        titleInput, submitButton
    ], {
        style: "display:flex; align-items:center; width: 100%; max-width: 400px; gap: 5px; box-sizing: border-box;", $click: (ev) => ev.stopPropagation(), $submit: (ev) => {
            ev.preventDefault()
            if (!titleInput.checkValidity()) return
            config().todo.push({ title: titleInput.value })
            updateLocalConfig(config())
            newItem.reset()
        }
    })
    const itemContainer = n('div', [])
    configSignal.subscribe((cfg) => {
        itemContainer.replaceChildren(...cfg.todo.toSorted(i => i.done ? 1 : 0).map(todo => {
            return renderItem(todo, editingSignal)
        }))
    })
    editingSignal.subscribe(() => {
        itemContainer.replaceChildren(...configSignal.value.todo.toSorted(i => i.done ? 1 : 0).map(todo => {
            return renderItem(todo, editingSignal)
        }))
    })
    const list = n('div', [
        n('h2', ['ToDos']),
        itemContainer,
        newItem
    ], {
        style: "height:100%", $click: () => {
            editingSignal.value = null
        }
    })
    return list;
}

function renderItem(todo, ephemeralSignal) {
    const children = []
    const item = n('div', children, { style: "display:flex; justify-content:space-between; align-items:center; width: 100%; max-width: 400px; gap: 5px; border: 1px solid var(--color-link); margin-bottom: 5px; padding:5px; box-sizing:border-box", $click: (ev) => ev.stopPropagation() })
    if (ephemeralSignal.value?.todo == todo) {
        const titleInput = n('input', [], { value: todo.title, required: true, style: "margin:0; flex-grow: 1", $keydown: (key) => { key.keyCode == 13 ? submitButton.click() : false } });
        const submitButton = n('button', ['✅'], {
            $click: () => {
                if (!titleInput.checkValidity()) return
                todo.title = titleInput.value
                ephemeralSignal.value = null
                updateLocalConfig(config())
            }
        })
        const deleteButton = n('button', ['🪣'], {
            $click: () => {
                config().todo = config().todo.filter(i => i != todo)
                ephemeralSignal.value = null
                updateLocalConfig(config())
            }
        })
        children.push(titleInput, submitButton, deleteButton)
    } else {
        const title = n('div', [todo.title], {
            $click: () => {
                if (todo.done) return
                ephemeralSignal.value = { todo }
            },
            style: "flex-grow:1;" + (todo.done ? '' : "cursor: pointer;")
        });
        const checkbox = n('input', [], {
            type: 'checkbox', $change: (ev) => {
                todo.done = ev.target.checked
                updateLocalConfig(config())
            },
            checked: todo.done ? true : undefined,
            style: "margin:0"
        })
        children.push(title, checkbox)
    }
    item.append(...children)
    return item
}

function sortTable(id, n) {
    const table = document.getElementById(id);
    if (!table || !(table instanceof HTMLTableElement)) {
        return
    }
    const elements = []
    const rows = table.rows;
    const tableHeader = rows[0]
    const headers = rows[0].getElementsByTagName("TH")
    const lastDir = headers[n].getAttribute("dir")
    const nextDir = !lastDir ? "asc" : lastDir == "asc" ? "desc" : "asc";
    [...headers].forEach(header => header.removeAttribute("dir"))
    headers[n].setAttribute("dir", nextDir)
    for (var i = 1; i < (rows.length); i++) {
        const row = rows[i]
        const el = row.getElementsByTagName("TD")[n]
        if (el && el instanceof HTMLTableCellElement) {
            elements.push({ row, v: el.innerText });
        }
    }
    elements.sort((a, b) => {
        const literal = +b.v - +a.v
        if (isNaN(literal)) {
            return a.v.localeCompare(b.v) * (nextDir == "asc" ? 1 : -1)
        }
        return literal * (nextDir == "asc" ? 1 : -1)
    })
    table.innerHTML = ''
    table.append(tableHeader, ...elements.map(el => el.row))
}

function renderOops() {
    return n('div', [n('h1'), ['Oops! 404 Ersatzteil benötigt!']])
}

/**
 * 
 * @param {Recipe} recipe 
 * @returns 
 */
function recipeLink(recipe) {
    return n('a', [recipe.name], { href: '#recipe/' + recipe.id + '-' + sluggy(recipe.name) })
}

function factoryLink(factoryId) {
    const factory = factoryById(config(), factoryId)
    if (!factory) {
        return n('span', [factoryId ?? 'unbekannte Fabrik'])
    }
    return n('a', [factory.name], { href: '#factory/' + factory.id + '-' + sluggy(factory.name) })
}

function materialLink(materialId) {
    const material = materialById(config(), materialId)
    if (!material) {
        return n('span', [materialId ?? 'unbekanntes Material'])
    }
    return n('a', [material.name], { href: '#material/' + material.id + '-' + sluggy(material.name) })
}

let hoveredlink;
let hovermarker;
document.body.addEventListener("mouseover", (event) => {
    if (event.target != hoveredlink) {
        mapTipLeave()
    }
})
function markerLink(marker, hovermap = true) {
    const icon = n('div', [], { class: machineMeta.get(marker.path)?.icon ?? 'b-icon', style: 'display:inline-block; min-height: 1rem; min-width:1rem;' })
    const text = markerText(marker);
    return n('a', [icon, text], {
        href: '#map/' + marker.id + '-' + sluggy(text), style: "display:inline-flex; align-items:center; gap:5px;", class: "maptiptarget",
        $mouseenter: (ev) => hovermap && mapTipEnter(marker, ev),
        $mousemove: (ev) => hovermap && mapTipOver(ev),
        $mouseleave: () => hovermap && mapTipLeave(),
    })
}
function mapTipEnter(md, event) {
    if (event.target == hoveredlink) {
        return
    }
    hoveredlink = event.target
    mapTipElement.style.display = "block"
    if (hovermarker) {
        hovermarker.remove()
    }
    const di = L.divIcon({ className: machineMeta.get(md.path)?.icon ?? 'b-icon' })
    hovermarker = L.marker(asLeafletCoord(md), { title: markerText(md), icon: di })
    hovermarker.addTo(mapTipMap);
    mapTipMap.panTo(hovermarker.getLatLng())
    mapTipElement.style.top = event.pageY + 10 + "px"
    mapTipElement.style.left = event.pageX + 10 + "px"
}

function asLeafletCoord(s) {
    return [(s.y / 16) * -1, s.x / 16]
}
function mapTipOver(event) {
    if (event.target == hoveredlink) {
        mapTipElement.style.top = event.pageY + 10 + "px"
        mapTipElement.style.left = event.pageX + 10 + "px"
    }
}
function mapTipLeave() {
    if (hoveredlink) {
        hoveredlink = undefined
        if (hovermarker) {
            hovermarker.remove()
            hovermarker = undefined
        }
        mapTipElement.style.display = "none"
        mapTipElement.style.top = 0
        mapTipElement.style.left = 0
    }
}

function translate(key) {
    return translation.get(key) ?? key;
}

function markerText(marker) {
    const l = translate(marker.name ?? marker.currentRecipe ?? marker.label)
    const t = translate(marker.type ?? marker.path)
    return l ? [l, t].join(' - ') : t
}

class MapComponent {
    element;
    attached = false;
    /**
     * 
     * @param {Signal<Route>} route
     * @param {Element} outlet
     */
    constructor(route, outlet) {
        this.outlet = outlet
        route.subscribe((route) => {
            if (route.type == "map") {
                this.attach(route)
            } else {
                this.detach()
            }
        })
    }
    attachCallbacks = []
    attach(route) {
        if (!this.attached) {
            if (!this.element) {
                this.element = this.render()
            }
            this.outlet.replaceChildren(this.element)
        }
        this.attachCallbacks.forEach(cb => cb(route.id))
        this.attached = true
    }
    detach() {
        this.attached = false
    }
    render() {
        return this.renderMap(this.attachCallbacks)
    }

    renderMap(attachCallbacks) {
        const maxX = 16
        const maxY = 16
        let selectedId = null
        let sContainer;
        let leafmap;
        let markers = []
        let lps = []
        const entities = new Map()
        const focused = []

        function markerForm(marker) {

            const deleteBtn = n('div', [
                n('button', ['Löschen 🪣'], {
                    $click: (event) => {
                        removeMarker(marker)
                        event.target.closest('dialog').close()
                    }
                }),
            ], { style: "display:flex; justify-content:end; gap:10px; margin-bottom: 10px" })

            const form = n('div', [
                n('h2', ['Marker']),
                n('form', [
                    n('div', [
                        fieldFn('Icon', { name: "icon", requierd: true, value: marker.icon, size: 1, maxLength: 10 }),
                        fieldFn('Text', { name: "text", requierd: true, value: marker.text })
                    ], { style: "display: flex; gap: 0.5rem" }),
                    ...(marker.id != undefined ? [deleteBtn] : []),
                    n('div', [
                        n('input', [], { value: marker.x, name: 'x', type: 'hidden' }),
                        n('input', [], { value: marker.y, name: 'y', type: 'hidden' }),
                        n('input', [], { value: marker.id, name: 'id', type: 'hidden' }),
                        n('button', ['Abbrechen'], { $click: (event) => event.target.closest('dialog').close() }),
                        n('button', ['OK'], { type: "submit" })
                    ], { style: "display:flex; justify-content:end; gap:10px;" }),
                ], { $submit: (event) => submitMarker(event), class: "formRows", method: "dialog" }),
                n('br')
            ])
            return form
        }

        function editMarker(marker) {
            displayModal(markerForm(marker))
        }

        function importMarkers() {
            displayModal(markerImportForm())
        }

        function markerImportForm() {
            const form = n('div', [
                n('h2', ['Marker Import']),
                n('form', [
                    n('div', [
                        fieldFn('Datei', { name: "markerFile", type: 'file', requierd: true })
                    ], { style: "display: flex; gap: 0.5rem" }),
                    n('div', [
                        n('button', ['Abbrechen'], { $click: (event) => event.target.closest('dialog').close() }),
                        n('button', ['OK'], { type: "submit" })
                    ], { style: "display:flex; justify-content:end; gap:10px;" }),
                ], { $submit: async (event) => await submitImportMarker(event), class: "formRows", method: "dialog" }),
                n('br'),
                n('p', [
                    "Save Game Locations:",
                    n('br'),
                    'Client: C:\\Program Files (x86)\\Steam\\userdata\\[RandomNumber]\\1631270\\remote\\Saved\\SaveGames',
                    n('br'),
                    'Server: StarRupture\\Saved\\SaveGames'
                ])
            ])
            return form
        }

        async function submitImportMarker(event) {
            const formData = new FormData(event.target)
            const filehandle = formData.get("markerFile")
            if (!filehandle || typeof filehandle === "string") {
                return
            }
            let content = ""
            if (filehandle.name.endsWith(".sav")) {
                const buffer = (await filehandle.arrayBuffer()).slice(4);
                const ds = new DecompressionStream("deflate")
                const writer = ds.writable.getWriter()
                writer.write(buffer)
                writer.close()
                content = await new Response(ds.readable).text()
            } else {
                content = await filehandle.text()
            }
            //console.debug(JSON.parse(content))
            const itemData = JSON.parse(content).itemData

            const fb = Object.entries(itemData.Mass.entities)
            const itemSet = new Set()
            fb.map(b => {
                return {
                    item: b[1].fragmentValues.map(v => {
                        const marr = v.match(/ItemDataBase=\"([^,]*)\"/)
                        if (marr) {
                            const i = marr[1].split("'").join("").split("/").pop()
                            itemSet.add(i)
                            return i
                        } else {
                            return null
                        }
                    }).filter(Boolean).pop()
                }
            })
            console.debug(itemSet)
            const recipeSet = new Set()
            fb.map(b => {
                return {
                    item: b[1].fragmentValues.map(v => {
                        const marr = v.match(/CurrentRecipe=\"([^,]*)\"/)
                        if (marr) {
                            const i = marr[1].split("'").join("").split("/").pop().split("\.").pop()
                            recipeSet.add(i)
                            return i
                        } else {
                            return null
                        }
                    }).filter(Boolean).pop()
                }
            })
            console.debug(recipeSet)

            const excludes = [
                "ForgottenEngine", "Foundations", "Interiors", "Modular",
                "Cooler", "WindPowerGenerator", "DroneConnections", "Foundable",
                "Antena", "ResourceRedistributor", "Exporter", "StartingPrinter", "Hub",
                "Turret_Tier1", "Turret_Tier2", "SolarPowerGenerator", "SolarPowerGeneratorTier2"]
            const buildings = Object.entries(itemData.Mass.entities).filter(([key, entry]) => {
                const path = entry.spawnData.entityConfigDataPath
                return path.indexOf("Buildings") >= 0 && excludes.every(e => path.indexOf(e) == -1)
            })
            const connections = Object.entries(itemData.CrPackageTransportReplicator.senderConnections).map(([key, val]) => {
                return {
                    from: key,
                    to: `(ID=${val.receiver.iD})`
                }
            })
            const paths = new Set()
            buildings.forEach(b => paths.add(b[1].spawnData.entityConfigDataPath))
            const strData = []
            const shorten = (marr) => {
                if (!marr) {
                    return marr
                }
                const key = marr[1].split("'").join("").split("/").pop().split("\.").pop()
                return key;
            }
            const buildStr = () => {
                const fb = buildings
                strData.length = 0
                const fs = fb.map(b => {
                    return {
                        id: b[0],
                        path: b[1].spawnData.entityConfigDataPath.split("/").slice(-2, -1).pop(),
                        name: itemData.CrBuildingCustomNameSubsystem.customNames[b[0]],
                        mainInventoryContainer: b[1].fragmentValues.map(v => {
                            return shorten(v.match(/MainInventoryContainer.*ItemDataBase=\"([^,]*)\"/))
                        }).filter(Boolean).pop(),
                        itemTypeFilter: b[1].fragmentValues.map(v => {
                            return shorten(v.match(/ItemTypeFilter=\(\"([^,]*)\"/))
                        }).filter(Boolean).pop(),
                        currentRecipe: b[1].fragmentValues.map(v => {
                            return shorten(v.match(/CurrentRecipe=\"([^,]*)\"/))
                        }).filter(Boolean).pop(),
                        translation: b[1].spawnData.transform.translation,
                    }
                })
                fs.forEach(n => strData.push(n))
                // console.debug(strData)
            }
            // console.debug(paths)
            // console.debug(buildings)
            // console.debug(strData)
            const opt = {
                mx: 350000,
                my: 300000,
                rx: 2385,
                ry: 2048,
                ox: 3273,
                oy: 2593,
                ct: 0,
                ds: 0
            }
            const render = (opt) => {
                buildStr()
                const ratiox = opt.mx / opt.rx
                const ratioy = opt.my / opt.ry
                strData.forEach(s => {
                    s.x = (s.translation.x / ratiox) + opt.ox
                    s.y = (s.translation.y / ratioy) + opt.oy
                })
                function combineLocations(nodes, threshold = 50) {
                    const remaining = nodes.map(n => ({ ...n }))
                    if (threshold == 0) {
                        return remaining
                    }
                    let merged = true
                    while (merged) {
                        merged = false
                        for (let i = 0; i < remaining.length; i++) {
                            for (let j = i + 1; j < remaining.length; j++) {
                                if (remaining[i].currentRecipe != undefined
                                    && remaining[j].currentRecipe != undefined
                                    && remaining[i].currentRecipe == remaining[j].currentRecipe) {
                                    const dx = remaining[i].x - remaining[j].x
                                    const dy = remaining[i].y - remaining[j].y
                                    const d = Math.sqrt(dx * dx + dy * dy)
                                    if (d < threshold) {
                                        remaining[i].x = (remaining[i].x + remaining[j].x) / 2
                                        remaining[i].y = (remaining[i].y + remaining[j].y) / 2
                                        remaining.splice(j, 1)
                                        merged = true
                                        break
                                    }
                                }
                            }
                            if (merged) break
                        }
                    }
                    return remaining
                }
                const combined = combineLocations(strData, opt.ct)
                strData.length = 0
                strData.push(...combined)
                for (const m of markers) {
                    m.remove()
                }
                for (const s of strData) {
                    const label = s.name ?? (s.currentRecipe ?? s.itemTypeFilter ?? s.mainInventoryContainer)
                    const type = s.path
                    const text = label ? [label, type].join(' - ') : type;
                    s.text = text
                    s.type = type
                    s.icon = machineMeta.get(s.path) ?? 'b-icon'
                    s.target = connections.find((c) => c.from == s.id)
                    renderMarker(s, opt.ds, entities)
                }
                renderMarkerList("")
                lps.forEach(lp => lp.remove())
                connections.forEach(element => {
                    const from = strData.find(e => e.id === element.from)
                    const to = strData.find(e => e.id === element.to)
                    if (!from || !to) {
                        return
                    }
                    const lp = L.polygon([
                        asLeafletCoord(from),
                        asLeafletCoord(to)
                    ]).addTo(leafmap);
                    lps.push(lp)
                });
                config().markers = strData
                updateLocalConfig(config())
            }
            render(opt)
            const bx = n('div', [
                fieldFn('Dot Size', { $input: (ev) => { opt.ds = +ev.target.value; render(opt) }, value: opt.ds, type: "number" }),
                fieldFn('Combine Threshold', { $input: (ev) => { opt.ct = +ev.target.value; render(opt) }, value: opt.ct, type: "number" }),
                fieldFn('Map max x', { $input: (ev) => { opt.mx = +ev.target.value; render(opt) }, value: opt.mx, type: "number" }),
                fieldFn('Map max y', { $input: (ev) => { opt.my = +ev.target.value; render(opt) }, value: opt.my, type: "number" }),
                fieldFn('Map ratio x', { $input: (ev) => { opt.rx = +ev.target.value; render(opt) }, value: opt.rx, type: "number" }),
                fieldFn('Map ratio y', { $input: (ev) => { opt.ry = +ev.target.value; render(opt) }, value: opt.ry, type: "number" }),
                fieldFn('Map offset x', { $input: (ev) => { opt.ox = +ev.target.value; render(opt) }, value: opt.ox, type: "number" }),
                fieldFn('Map offset y', { $input: (ev) => { opt.oy = +ev.target.value; render(opt) }, value: opt.oy, type: "number" }),
            ], { style: "position:fixed; top:0;left:0; display:flex;flex-direction:column; max-width: 300px; max-height: 100vh; overflow:auto; background: #333c" })
            //document.body.appendChild(bx)
        }

        function exportMarkers() {
            const stringified = serialize(config().markers)
            const fileName = "CraftyMarkers-" + sluggy(config().game) + '-' + new Date().getTime() + '.json'
            download(stringified, fileName, 'application/json')
        }

        function removeMarker(marker) {
            const markerIndex = config().markers.findIndex(m => m.id == marker.id)
            if (markerIndex != -1) {
                config().markers.splice(markerIndex, 1)
                updateLocalConfig(config())
            }
        }

        function submitMarker(event) {
            event.preventDefault()
            const formData = new FormData(event.target)
            const element = mergeForm(formData, {})
            const collection = config().markers
            const inserted = upsert(collection, element, event)
            if (!inserted) {
                return false
            }
            updateLocalConfig(config())
            event.target.closest('dialog').close()
        }

        function renderMarkers() {
            for (const m of markers) {
                m.remove()
            }
            config().markers.forEach(m => renderMarker(m, 0, entities))
        }

        /**
         * 
         * @param {String|null} [filter]
         */
        function renderMarkerList(filter = "") {
            markerList.innerHTML = '';
            config().markers.forEach(md => {
                const text = markerText(md);
                const shouldDisplay = (text).toLowerCase().indexOf((filter ?? "").toLowerCase()) > -1
                if (shouldDisplay) {
                    const markerEditButton = n('button', ['✏️'], { '$click': () => editMarker(md), class: 'fab' })
                    const markerRow = n('div', [markerLink(md, false), markerEditButton], { style: "display:flex; gap:2rem; align-items:center; justify-content:space-between;", class: 'hoverRow' })
                    markerList.append(
                        markerRow
                    )
                }
            })
        }

        function clearConnections() {
            lps.forEach(lp => lp.remove())
        }

        function renderConntecions() {
            clearConnections()
            const markers = config().markers
            markers.forEach(md => {
                if (md.target) {
                    const from = markerById(config(), md.target.from);;
                    const to = markerById(config(), md.target.to);
                    if (!to || !from) {
                        // console.log(md.target)
                        return
                    }
                    const lp = L.polygon([
                        asLeafletCoord(from),
                        asLeafletCoord(to)
                    ]).addTo(leafmap);
                    lps.push(lp)
                }
            });
        }


        /**
         * 
         * @param {*} md 
         * @param {*} ds 
         * @param {Map} [entries]
         */
        const renderMarker = (md, ds = 0, entries = undefined) => {
            const di = L.divIcon({ className: machineMeta.get(md.path)?.icon ?? 'b-icon' })
            const marker = L.marker(asLeafletCoord(md), { title: markerText(md), icon: di })
            markers.push(marker.addTo(leafmap));
            if (entries) {
                entries.set(md.id, { marker, meta: md })
            }
            // TODO: focus
            // if (selectedId == md.id) {
            //     setFocus(markerLayer, md)
            // }
        }

        const suppress = (event) => {
            event.stopPropagation()
            event.preventDefault()
        }

        function focusMarkerAndScroll(md, map, instant = false) {
            selectedId = md.id
            sContainer.scrollTop = md.y - (sContainer.clientHeight / 2)
            sContainer.scrollLeft = md.x - (sContainer.clientWidth / 2)
            setTimeout(() => {
                focused.forEach(m => m?.getElement()?.classList.remove("highlight"))
                focused.length = 0
                const marker = entities.get(md.id).marker
                marker.getElement().classList.add("highlight")
                focused.push(marker)
                leafmap.panTo(marker.getLatLng(), instant ? {} : { animate: true, duration: 1 })
            }, 200);
            // TODO: focus
            // removeFocus(markerLayer)
            // setFocus(markerLayer, md)
        }

        function setFocus(markerLayer, md) {
            const mapMarker = markerLayer.querySelector(`#marker-${md.id}`)
            mapMarker.style.backgroundColor = "red"
            mapMarker.classList.toggle("selected")
        }

        function removeFocus(markerLayer) {
            const selected = markerLayer.querySelector(".selected")
            if (selected) {
                selected.style.backgroundColor = "white"
                selected.classList.toggle("selected")
            }
        }

        function createMap() {
            const mp = n('div', [], { style: "width: 100%; height: 100%;" })
            setTimeout(() => {
                mp.width = mp.getBoundingClientRect().width
                mp.height = mp.getBoundingClientRect().height
                setTimeout(() => {
                    leafmap = L.map(mp, {
                        crs: L.CRS.Simple,
                        minZoom: 0,
                        maxZoom: 5,
                        zoomSnap: 0,
                        zoomDelta: 0.25,
                    })

                    L.tileLayer('./tiles/{z}/{x}_{y}.webp', {
                        noWrap: true
                    }).addTo(leafmap);

                    leafmap.setView([-140, 70], 5);

                    const Legend = L.Control.extend({
                        onAdd() {
                            const container = L.DomUtil.create('div');
                            container.style.background = 'rgba(255,255,255,0.5)';
                            container.style.textAlign = 'right';
                            container.style.padding = "2px"
                            container.style.display = "flex"
                            container.style.flexDirection = "column"
                            container.style.gap = "2px";
                            [...machineMeta.entries()].forEach(([k, v]) => {
                                if (k == "ZiplineVariants") {
                                    return
                                }
                                const icon = n('div', [], { class: v.icon, style: "min-width: 1rem; min-height: 1rem" })
                                container.append(n('div', [icon, v.name], { style: "color:black;display: flex;  gap: 5px;  flex-wrap: owrap;  align-items: center;" }))
                            }
                            )
                            return container;
                        }
                    });

                    const zoomViewerControl = (new Legend()).addTo(leafmap);

                    markerFilterSignal.subscribe((filter) => {
                        renderMarkerList(filter)
                    })
                    connectionsSignal.subscribe((active) => {
                        if (active) {
                            renderConntecions()
                        } else {
                            clearConnections()
                        }
                    })

                    configSignal.subscribe(() => {
                        setTimeout(() => {
                            renderMarkers()
                        }, 30)
                        renderMarkerList(markerFilterSignal.value)
                    })
                }, 10);
            }, 10)
            return mp;
        }
        const map = createMap()
        const markerList = n('div', [], { style: "overflow:auto; padding: 0px 5px; flex-grow: 1; display:flex; flex-direction: column; gap: 5px;" })
        const container = n(
            'div',
            [map],
            {
                style: "height: 90vh; position: relative;"
            }
        )
        sContainer = container
        attachCallbacks.push(
            (id) => {
                if (id === 0 || id) {
                    focusMarkerAndScroll(markerById(config(), id), leafmap, !leafmap)
                } else {
                    removeFocus(map)
                    if (leafmap) {
                        leafmap.setView([-140, 70], 5);
                    }
                }
            }
        )

        const markerFilterSignal = signal("")
        const markerFilterInput = n('input', [], {
            placeholder: 'Marker Filter', $input: (ev) => {
                markerFilterSignal.value = ev.target.value
            }
        }, "marker-filter-input")
        const connectionsSignal = signal(false)
        const connectionsInput = fieldFn("Verbindungen", {
            checked: connectionsSignal.value,
            type: "checkbox", $click: (ev) => {
                if (ev.target.checked) {
                    connectionsSignal.value = true
                } else {
                    connectionsSignal.value = false
                }
            }
        }, "connections-input")


        const markerFilter = n('div', [markerFilterInput])
        const markerActions = n('div', [
            n('button', ['Marker Import'], { $click: () => importMarkers() }),
            n('button', ['Marker Export'], { $click: () => exportMarkers() })
        ], { style: 'display:flex; gap:10px' })
        const makerListContainer = n('div', [markerFilter, connectionsInput, markerList, markerActions], { style: 'display:flex; gap:10px; flex-direction: column; height: 90vh; width: 250px' })
        return n('div', [
            n('h2', ['Map']),
            // n('div', [
            //     n('span', ['Marker können mit Rechtsklick hinzugefügt werden.']),
            //     n('div', [], { style: "flex-grow:1" }),
            //     n('button', ['Mit Strahlung'], {
            //         $click: (event) => {
            //             if (event.target.classList.contains("active")) return
            //             map.replaceChildren(...createTiles("tiles_rad"))
            //             event.target.parentElement.querySelectorAll("button.active").forEach(n => n.classList.remove("active"))
            //             event.target.classList.add("active")
            //         }
            //     }),
            //     n('button', ['Ohne Strahlung'], {
            //         $click: (event) => {
            //             if (event.target.classList.contains("active")) return
            //             map.replaceChildren(...createTiles("tiles"))
            //             event.target.parentElement.querySelectorAll("button.active").forEach(n => n.classList.remove("active"))
            //             event.target.classList.add("active")
            //         },
            //         class: "active"
            //     })
            // ], { style: "display:flex; gap:10px; align-items:center;" }),
            n('div', [container, makerListContainer], { style: "display: grid; gap: 10px; grid-template-columns: 1fr 250px" })
        ], { style: "display:flex; gap:5px; flex-direction:column;" })

        function createTiles(base) {
            const tiles = []
            for (let xi = 0; xi < maxX; xi++) {
                for (let yi = 0; yi < maxY; yi++) {
                    tiles.push(n('img', [], { src: `./${base}/${yi}_${xi}.webp`, $click: suppress, style: "pointer-events:none; user-select:none" }))
                }
            }
            return tiles
        }
    }
}

function renderTechTree() {
    const slot = n('div')
    const options = { distance: 100, strength: -800 }
    slot.innerHTML = ''
    slot.append(techtree(options, config().recipes))

    const textSpanDistance = n('span', [])
    textSpanDistance.innerText = `Abstand (${options.distance})`

    const textSpanForce = n('span', [])
    textSpanForce.innerText = `Kraft (${options.strength})`

    const controls = n('div', [
        n('label', [
            textSpanDistance,
            n('input', [], {
                $input: (event) => {
                    try {
                        options.distance = +event.target.value
                        slot.innerHTML = ''
                        slot.append(techtree(options, config().recipes))
                        textSpanDistance.innerText = `Abstand (${options.distance})`
                    } catch (e) {
                        console.error("That's a bust", e)
                    }
                },
                type: 'range',
                min: 0,
                value: 100,
                max: 300
            })
        ]),
        n('label', [
            textSpanForce,
            n('input', [], {
                $input: (event) => {
                    try {
                        options.strength = +event.target.value
                        slot.innerHTML = ''
                        slot.append(techtree(options, config().recipes))
                        textSpanForce.innerText = `Kraft (${options.strength})`
                    } catch (e) {
                        console.error("That's a bust", e)
                    }
                },
                type: 'range',
                min: -1000,
                value: -800,
                max: 0
            })
        ])
    ], { style: 'display: flex' })

    return n('div', [
        n('h2', ['Tech Network']),
        controls,
        slot
    ])
}

function renderMaterialList() {
    const materials = config().materials
    return n('div', [
        n('h2', ['Materialien 🪨']),
        n('table', [
            n('tr', [
                n('th', ['Name'], { $click: () => sortTable('materialTbl', 0), style: "cursor:pointer;" }),
            ]),
            ...materials.toSorted((a, b) => a.name.localeCompare(b.name)).map(f => n('tr', [
                n('td', [materialLink(f.id)]),
            ]))
        ], { id: 'materialTbl' })
    ])
}

function renderMaterial(id) {
    const material = materialById(config(), +id)
    if (!material) {
        window.location.hash = "material"
        navigate(new URL(window.location.href))
        return
    }
    const recipies = materialMadeByRecipes(config(), id)
    const recipeNodes = []
    for (const recipie of recipies) {
        recipeNodes.push(n('br'))
        recipeNodes.push(recipeLink(recipie))
    }
    const markerNodes = []
    config().markers.filter(m => translate(m.currentRecipe) == material.name).forEach(m => {
        markerNodes.push(n('div', [markerLink(m)]))
    })
    return n('div', [
        n('div', [
            n('h2', [material.name]),
            n('div', [
                n('button', ['✏️'], { '$click': () => editMaterial(material), class: 'fab' }),
                n('button', ['🪣'], { '$click': () => deleteMaterial(material), class: 'fab' }),
            ], { style: 'display:flex; gap: 10px;' })
        ], { style: 'display:flex; align-items: center; gap: 50px;' }),
        n('p', ['Hergestellt von: ', ...recipeNodes]),
        n('br'),
        n('p', ['Hergestellt bei: ', ...markerNodes]),
    ])
}

function renderFactoryList() {
    const factories = config().factories
    return n('div', [
        n('h2', ['Fabriken 🏭']),
        n('table', [
            n('tr', [
                n('th', ['Name'], { $click: () => sortTable('factoryTbl', 0), style: "cursor:pointer;" }),
                n('th', ['Strom'], { $click: () => sortTable('factoryTbl', 1), style: "cursor:pointer;" }),
                n('th', ['Hitze'], { $click: () => sortTable('factoryTbl', 2), style: "cursor:pointer;" })
            ]),
            ...factories.toSorted((a, b) => a.name.localeCompare(b.name)).map(f => n('tr', [
                n('td', [factoryLink(f.id)]),
                n('td', [f.power], { style: 'color: cyan' }),
                n('td', [f.heat], { style: 'color: coral' })
            ]))
        ], { id: 'factoryTbl' })
    ])
}

function renderFactory(id) {
    const factory = factoryById(config(), +id)
    if (!factory) {
        window.location.hash = "factory"
        navigate(new URL(window.location.href))
        return
    }
    const recipies = factoryMakesRecipes(config(), id)
    const recipeNodes = []
    for (const recipie of recipies) {
        recipeNodes.push(recipeCard(recipie, config()))
    }
    return n('div', [
        n('div', [
            n('h2', [factory.name]),
            n('div', [
                n('button', ['✏️'], { '$click': () => editFactory(factory), class: 'fab' }),
                n('button', ['🪣'], { '$click': () => deleteFactory(factory), class: 'fab' }),
            ], { style: 'display:flex; gap: 10px;' })
        ], { style: 'display:flex; align-items: center; gap: 50px;' }),
        n('p', ['Hitze: ', factory.heat,], { style: 'color: coral' }),
        n('p', ['Strom: ', factory.power,], { style: 'color: cyan' }),
        n('p', ['Stellt her: ', n('div', recipeNodes, { class: "floaties" })], { style: "max-width: 750px;" })
    ])
}

function renderRecipeList() {
    const recipes = config().recipes
    return n('div', [
        n('h2', ['Rezepte 📄']),
        n('table', [
            n('tr', [
                n('th', ['Name'], { $click: () => sortTable('recipeTbl', 0), style: "cursor:pointer;" }),
                n('th', ['Produziert'], { $click: () => sortTable('recipeTbl', 1), style: "cursor:pointer;" }),
                n('th', ['Fabrik'], { $click: () => sortTable('recipeTbl', 2), style: "cursor:pointer;" })
            ]),
            ...recipes.toSorted((a, b) => a.name.localeCompare(b.name)).map(r => n('tr', [
                n('td', [recipeLink(r)]),
                n('td', [materialLink(r.materialId)]),
                n('td', [factoryLink(r.factoryId)])
            ]))
        ], { id: 'recipeTbl' })
    ])
}

function renderRecipe(id) {
    const recipe = recipeById(config(), id)
    if (!recipe) {
        window.location.hash = "recipe"
        navigate(new URL(window.location.href))
        return
    }
    const dependantRecipies = [{ ...recipe, primary: true, level: 0 }]
    const edge = [{ ...recipe, primary: false, level: 0 }]
    while (edge.length > 0) {
        const r = edge.shift();
        if (!r) {
            return
        }
        (r.ingredients ?? []).forEach(i => edge.push({ ...materialMadeByRecipes(config(), i.id)[0], level: r.level + 1, primary: false }));
        if (dependantRecipies.find(d => +d.id === +r.id) == undefined) {
            dependantRecipies.push(r);
        }
    }
    const recipeNodes = []
    for (const mr of materialUsedByRecipes(config(), recipe.materialId)) {
        recipeNodes.push(n('br'))
        recipeNodes.push(recipeLink(mr))
    }
    const unlockNodes = []
    if (recipe.unlock) {
        recipe.unlock.forEach((u) => {
            unlockNodes.push(n('div', [materialLink(u.id), ' ', u.amount]))
        })
    }
    if (unlockNodes.length == 0) {
        unlockNodes.push(n('div', ['sofort Freigeschalten']))
    }
    const material = materialById(config(), recipe.materialId)
    const markerNodes = []
    let relevantMarkers = []
    if (material) {
        relevantMarkers = config().markers.filter(m => translate(m.currentRecipe) == material.name).toSorted((a, b) => (a.x + a.y) - (b.x + b.y))
        relevantMarkers.forEach(m => {
            markerNodes.push(n('div', [markerLink(m)]))
        })
    }
    const minimap = (markerNodes) => {
        const minimapElement = n('div', [], { id: 'minimap', width: 256, height: 256, style: "width:256px; height:256px;" })
        setTimeout(() => {
            const minimapMap = L.map('minimap', {
                crs: L.CRS.Simple,
                minZoom: 0,
                maxZoom: 0,
                zoomControl: false,
                dragging: false
            })

            L.tileLayer('./tiles/{z}/{x}_{y}.webp', {
                noWrap: true
            }).addTo(minimapMap);

            minimapMap.setView([-128, 128], 5);

            setTimeout(() => {
                markerNodes.forEach((md) => {
                    const di = L.divIcon({ className: machineMeta.get(md.path)?.icon ?? 'b-icon' })
                    const minmapmarker = L.marker(asLeafletCoord(md), { title: markerText(md), icon: di })
                    minmapmarker.addTo(minimapMap);
                    minmapmarker.getElement().addEventListener("click", () => window.location.href = '#map/' + md.id + "-")
                })
            }, 100);
        }, 100);
        return minimapElement
    }
    const tt = (() => {
        try {
            return techtree({}, dependantRecipies)
        } catch {
            return n('div')
        }
    })()
    return n('div', [
        n('div', [
            n('div', [
                n('div', [
                    n('h2', [recipe.name]),
                    n('div', [
                        n('button', ['✏️'], { '$click': () => editRecipe(recipe), class: 'fab' }),
                        n('button', ['🪣'], { '$click': () => deleteRecipe(recipe), class: 'fab' }),
                    ], { style: 'display:flex; gap: 10px;' })
                ], { style: 'display:flex; align-items: center; gap: 50px;' }),
                n('span', ['Output: ', recipe.quantity, '/', recipe.time, 's', " (", (60 / +recipe.time) * recipe.quantity, '/min)']),
                n('br'),
                n('div', [
                    n('div', [
                        n('p', ['Erzeugt: ', materialLink(recipe.materialId)]),
                        n('p', ['Zutaten: ', ...(recipe.ingredients?.map(i => {
                            return n('div', [materialLink(i.id), ' ', i.amount])
                        }) ?? [])]),
                        n('p', ['Hergestellt in: ', factoryLink(recipe.factoryId)]),
                        n('p', ['Verwendet von: ', ...recipeNodes]),
                        n('p', ['Freigeschalten mit: ', ...unlockNodes])
                    ]),
                    n('div', [
                        n('p', ['Hergestellt bei: ', minimap(relevantMarkers), n('div', markerNodes, { style: "max-height: 250px; overflow:auto; overscroll-behavior: contain;" })]),
                    ]),
                ], { class: "columns" }),

            ], { style: 'flex-grow:1' })
        ], { style: 'display:flex; gap: 10px; align-items:start; justify-content: space-between;' }),
        displayCalc(recipe.id),
        tt
    ], { style: 'max-width: 1000px' })
}

/**@type Signal<Route> */
const route = signal()

function hookIntoNav() {
    const rootElementName = 'outlet'
    const root = document.querySelector(rootElementName)
    if (root) {
        new MapComponent(route, root)
        new TodoComponent(route, root)
    }
    // @ts-ignore
    navigation.addEventListener("navigate", (event) => {
        const url = new URL(event.destination.url);
        navigate(url)
    });
}

function key() {
    //return "crafty"
    return window.location.href.indexOf("localhost") > -1 ? "local:crafty" : "crafty"
}

function saveInternal(cfg) {
    localStorage.setItem(key(), serialize([cfg, sluggy(cfg.game)]))
}

function save() {
    const stringied = serialize(config())
    const fileName = "Crafty-" + sluggy(config().game) + '-' + new Date().getTime() + '.json'
    download(stringied, fileName, 'application/json')
}

function download(data, filename, type) {
    var file = new Blob([data], { type: type });
    var a = document.createElement("a"),
        url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
}

function displayInfo(root) {
    root.innerHTML = ""
    root.append(n('div', [`Rezepte geladen für: ${config().game}`]))
}

function noi(event) {
    const formData = new FormData(event.target)
    const newConfig = structuredClone(defaultConfig)
    for (const [key, value] of formData.entries()) {
        newConfig[key] = value
    }
    const slug = newConfig.game // TODO: sluggify
    const configName = slug
    updateLocalConfig(newConfig)
    state.configName = configName
    return true
}

function mergeForm(formData, target) {
    for (const [key, value] of formData.entries()) {
        if (key.indexOf('.') == -1) {
            target[key] = typeof value == "string" ? value.trim() : value
        } else {
            const [parentKey, index, subkey] = key.split('.')
            if (!target[parentKey]) {
                target[parentKey] = []
            }
            if (!target[parentKey].find(item => item.index == index)) {
                target[parentKey].push({ index: index })
            }
            target[parentKey].find(item => item.index == index)[subkey] = value
        }
    }
    return target
}

function isNameUnique(event, collection) {
    const inp = event?.target?.querySelector('[name="name"]')
    if (!inp) {
        return true
    }
    if (collection.some(item => item.name.toLowerCase() === inp.value.toLowerCase())) {
        inp.setCustomValidity(inp.value + " ist bereits vorhanden")
        inp.reportValidity()
        return false
    } else {
        inp.setCustomValidity("")
        return true
    }
}

function upsert(collection, element, event) {
    if (element.id === 0 || element.id) {
        collection[collection.findIndex(r => r.id == element.id)] = element
    } else {
        if (!isNameUnique(event, collection)) {
            return false
        }
        const ids = collection.map(r => r.id)
        element.id = Math.max(...ids, -1) + 1
        collection.push(element)
    }
    return true
}

function submitFactory(event) {
    event.preventDefault()
    //event.stopPropagation()
    const formData = new FormData(event.target)
    const element = mergeForm(formData, {})
    const collection = config().factories
    const inserted = upsert(collection, element, event)
    if (!inserted) {
        return false
    }
    collection.sort((a, b) => a.name.localeCompare(b.name))
    updateLocalConfig(config())
    event.target.closest('dialog').close()
}

function submitRecipe(event) {
    event.preventDefault()
    const formData = new FormData(event.target)
    const element = mergeForm(formData, {})
    const collection = config().recipes
    const inserted = upsert(collection, element, event)
    if (!inserted) {
        return false
    }
    collection.sort((a, b) => a.name.localeCompare(b.name))
    updateLocalConfig(config())
    event.target.closest('dialog').close()
}

function submitMaterial(event) {
    event.preventDefault()
    const formData = new FormData(event.target)
    const element = mergeForm(formData, {})
    const collection = config().materials
    const inserted = upsert(collection, element, event)
    if (!inserted) {
        return false
    }
    collection.sort((a, b) => a.name.localeCompare(b.name))
    updateLocalConfig(config())
    event.target.closest('dialog').close()
}

function addIngredient(event, parent, ingredient) {
    const parentDataset = parent.dataset
    const count = parentDataset['count'] ?? 0
    const materialChoices = () => config().materials.map(m => n('option', [m.name], { value: m.id }))
    const newIngredient = n('div', [
        selectFn('Zutat', materialChoices(), { name: `ingredients.${count}.id`, requierd: true, value: ingredient?.id ?? null }),
        fieldFn('Anzahl', { name: `ingredients.${count}.amount`, requierd: true, value: ingredient?.amount ?? null }),
        n('button', ['🪣'], { '$click': () => parent.removeChild(newIngredient), class: 'fab' }),
    ], { style: "display: flex; align-items:center; gap: 0.5rem" })

    parent.appendChild(newIngredient)
    parentDataset['count'] = +count + 1
}

const selectFn = (label, choices, opts) => n('label', [n('span', [label]), n('select', choices, opts)])

function factoryForm(factory) {
    const form = n('div', [
        n('h2', ['Fabrik hinzufügen']),
        n('form', [
            n('div', [
                fieldFn('Name', { name: "name", requierd: true, value: factory.name })
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                fieldFn('Interne Id (optional)', { name: "internalId", requierd: false, value: factory.internalId }),
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                fieldFn('Strom', { name: "power", requierd: true, value: factory.power }),
                fieldFn('Hitze', { name: "heat", requierd: true, value: factory.heat })
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                n('input', [], { value: factory.id, name: 'id', type: 'hidden' }),
                n('button', ['Abbrechen'], { $click: (event) => event.target.closest('dialog').close() }),
                n('button', ['OK'], { type: "submit" })
            ], { style: "display:flex; justify-content:end; gap:10px;" }),
        ], { $submit: (event) => submitFactory(event), class: "formRows", method: "dialog" }),
        n('br')
    ])
    return form
}

function recipeForm(recipe) {
    const factoryChoices = () => config().factories.map(f => n('option', [f.name], { value: f.id }))
    const factorySelect = selectFn('Factory', factoryChoices(), { name: "factoryId", requierd: true, value: recipe.factoryId })
    const materialChoices = () => config().materials.map(m => n('option', [m.name], { value: m.id }))
    const materialSelect = selectFn('Produziert', materialChoices(), { name: "materialId", requierd: true, value: recipe.materialId })
    const ingredientNode = n('div')

    const form = n('div', [
        n('h2', ['Rezept hinzufügen']),
        n('form', [
            n('div', [
                fieldFn('Name', { name: "name", requierd: true, value: recipe.name }),
                factorySelect,
                n('button', ["+ 🏭"], {
                    $click: () => {
                        const afterRemove = addFactory();
                        afterRemove.subscribe(() => factorySelect.replaceWith(selectFn('Factory', factoryChoices(), { name: "factoryId", requierd: true, value: recipe.factoryId })))
                    }
                })
            ], { style: "display: flex; gap: 0.5rem; align-items: center;" }),
            n('div', [
                fieldFn('Interne Id (optional)', { name: "internalId", requierd: false, value: recipe.internalId }),
                materialSelect,
                n('button', ["+ 🪨"], {
                    $click: () => {
                        const afterRemove = addMaterial()
                        afterRemove.subscribe(() => materialSelect.replaceWith(selectFn('Produziert', materialChoices(), { name: "materialId", requierd: true, value: recipe.materialId })))
                    }
                })
            ], { style: "display: flex; gap: 0.5rem; align-items: center;" }),
            n('div', [
                fieldFn('Anzahl', { name: "quantity", requierd: true, value: recipe.quantity }),
                fieldFn('Dauer', { name: "time", requierd: true, value: recipe.time })
            ], { style: "display: flex; gap: 0.5rem" }),
            ingredientNode,
            n('div', [
                n('button', ['neue Zutat'], { $click: (event) => addIngredient(event, ingredientNode) })
            ]),
            n('div', [
                n('input', [], { value: recipe.id, name: 'id', type: 'hidden' }),
                n('button', ['Abbrechen'], { $click: (event) => event.target.closest('dialog').close() }),
                n('button', ['OK'], { type: "submit" })
            ], { style: "display:flex; justify-content:end; gap:10px;" }),
        ], { $submit: (event) => submitRecipe(event), class: "formRows", method: "dialog" }),
        n('br')
    ])
    for (const ingredient of recipe.ingredients ?? []) {
        addIngredient(null, ingredientNode, ingredient)
    }
    return form
}

function materialForm(material) {
    const form = n('div', [
        n('h2', ['Material hinzufügen']),
        n('form', [
            n('div', [
                fieldFn('Name', { name: "name", requierd: true, value: material.name }),
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                fieldFn('Interne Id (optional)', { name: "internalId", requierd: false, value: material.internalId }),
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                n('input', [], { value: material.id, name: 'id', type: 'hidden' }),
                n('button', ['Abbrechen'], { $click: (event) => event.target.closest('dialog').close() }),
                n('button', ['OK'], { type: "submit" })
            ], { style: "display:flex; justify-content:end; gap:10px;" }),
        ], { $submit: (event) => submitMaterial(event), class: "formRows", method: "dialog" }),
        n('br')
    ])
    return form
}

function displayCalc(id) {
    return n('calculation', [
        n('form', [
            n('input', [], { type: 'hidden', value: id, name: 'ingredient' }),
            n('label', ['Output: ', n('input', [], { name: 'amount', style: 'display:inline-block' }), ' pro Sekunde'], { style: 'display:inline-block' }),
            ' ',
            n('button', ['Go!'], { type: 'submit' })
        ], { $submit: (event) => calculate(event) }),
        n('form', [
            n('input', [], { type: 'hidden', value: id, name: 'ingredient' }),
            n('label', ['Fabriken: ', n('input', [], { name: 'factories', style: 'display:inline-block' })], { style: 'display:inline-block' }),
            ' ',
            n('button', ['Go!'], { type: 'submit' })
        ], { $submit: (event) => calculate(event) }),
        n('result')
    ])
}

/**
 * @param {Recipe} recipe
                            * @param {number} amount
                            */
function calcInner(recipe, amount) {
    const singleRate = (+(recipe.quantity) / +(recipe.time))
    return {
        recipeId: recipe.id,
        factoryId: recipe.factoryId,
        machines: amount / singleRate,
        amount,
        ingredients: recipe.ingredients?.map(i => calcInner(materialMadeByRecipes(config(), i.id)[0], (amount * +(i.amount) / +(recipe.quantity))))
    }
}

function p2(v) {
    return +parseFloat(v).toPrecision(2)
}

function renderCalcTree(data) {
    const recipe = recipeById(config(), data.recipeId)
    const factory = factoryById(config(), data.factoryId)
    const singleRecipe = n('div', [
        n('b', [recipe.name]),
        ' ',
        n('i', [factory?.name ?? data.factoryId, ' x', p2(data.machines)]),
        ' ',
        p2(data.amount),
        '/s',
        ' ',
        `(${p2(data.amount * 60)}/min)`
    ], {
        style: 'display: inline-block'
    })
    if (!data.ingredients || data.ingredients.length == 0) {
        return n('details', [
            n('summary', [
                singleRecipe
            ])
        ], {
            style: 'padding: 10px',
            open: 'true'
        })
    }
    return n('details', [
        n('summary', [
            singleRecipe
        ]),
        ...data.ingredients.map(i => renderCalcTree(i))
    ], {
        style: 'padding: 10px',
        open: 'true'
    })
}

function renderFactorySummary(data) {
    const factories = new Map()
    const edge = [data]
    while (edge.length > 0) {
        const el = edge.shift()
        el.ingredients?.forEach(i => edge.push(i))
        factories.set(+el.factoryId, (factories.get(+el.factoryId) ?? 0) + Math.ceil(el.machines))
    }
    return n('div', [
        'Zusammenfassung Fabriken:',
        n('ul', [...factories.entries()]
            .map(([id, amount]) => [factoryById(config(), id), amount])
            .toSorted((a, b) => a[0].name.localeCompare(b[0].name))
            .map(([factory, amount]) => {
                return n('li', [
                    factory.name,
                    ' ',
                    amount,
                    ' ',
                    n('span', [`H:${factory.heat * amount}`], { style: 'color: coral' }),
                    ' ',
                    n('span', [`E:${factory.power * amount}`], { style: 'color: cyan' })
                ])
            }))
    ])
}

function renderMaterialSummary(data) {
    const materials = new Map()
    const edge = []
    if ((data.ingredients ?? []).length > 0) {
        data.ingredients?.forEach(i => edge.push(i))
    }
    while (edge.length > 0) {
        const el = edge.shift()
        el.ingredients?.forEach(i => edge.push(i))
        materials.set(+el.recipeId, (materials.get(+el.recipeId) ?? 0) + Math.ceil(el.amount))
    }
    return n('div', [
        'Zusammenfassung Material:',
        n('ul', [...materials.entries()]
            .map(([id, amount]) => [recipeById(config(), id), amount])
            .toSorted((a, b) => a[0].name.localeCompare(b[0].name))
            .map(([recipe, amount]) => {
                return n('li', [
                    recipeLink(recipe),
                    ' ',
                    amount,
                    '/s'
                ])
            }))
    ])
}

function calculate(event) {
    event.preventDefault()
    const formData = new FormData(event.target)
    const recipeId = +formData.get("ingredient")
    const recipe = recipeById(config(), recipeId)
    let amount = 0;
    if (formData.has("amount")) {
        amount = +formData.get("amount")
    }
    if (formData.has("factories")) {
        amount = +formData.get("factories") * (+(recipe.quantity) / +(recipe.time))
    }

    const justData = calcInner(recipe, amount)

    const parts = []
    parts.push(renderCalcTree(justData))
    parts.push(n('div', [
        renderFactorySummary(justData),
        renderMaterialSummary(justData)
    ]))

    const res = document.querySelector("result")
    if (!res) {
        return
    }
    res.innerHTML = ''
    res.append(n('div', parts, { style: 'display:flex; gap: 10px; align-items:start; justify-content: space-between;' }))
}

function deleteFactory(factory) {
    const cfg = config()
    if (factoryMakesRecipes(cfg, factory.id).length > 0) {
        alert("Fabrik wird verwendet, kann nicht gelöscht werden")
    } else {
        cfg.factories = cfg.factories.filter(f => f != factory)
        updateLocalConfig(cfg)
    }
}

function editRecipe(recipe) {
    displayModal(recipeForm(recipe))
}

function addRecipe() {
    displayModal(recipeForm({}))
}

function editFactory(factory) {
    displayModal(factoryForm(factory))
}

function addFactory() {
    return displayModal(factoryForm({}))
}

function editMaterial(material) {
    return displayModal(materialForm(material))
}

function addMaterial() {
    return displayModal(materialForm({}))
}

function deleteMaterial(material) {
    const cfg = config()
    if (materialMadeByRecipes(cfg, material.id).length > 0) {
        alert("Material wird verwendet, kann nicht gelöscht werden")
    } else {
        cfg.materials = cfg.materials.filter(m => m != material)
        updateLocalConfig(cfg)
    }
}

/**
 * @param {Config} config
                            * @param {number} id
                            * @returns {Recipe}
                            */
function recipeById(config, id) {
    return config.recipes.filter(r => r.id == id)[0]
}

/**
 * @param {Config} config
                            * @param {number} id
                            * @returns {Factory}
                            */
function factoryById(config, id) {
    return config.factories.filter(f => f.id == id)[0]
}

/**
 * @param {Config} config
                            * @param {number} id
                            * @returns {Material}
                            */
function materialById(config, id) {
    return config.materials.filter(f => f.id == id)[0]
}

/**
 * @param {Config} config
                            * @param {number} id
                            * @returns {any}
                            */
function markerById(config, id) {
    return config.markers.filter(m => m.id == id)[0]
}

function filterRecipes(config, recipe, filter) {
    return recipe.name.toLowerCase().indexOf(filter.toLowerCase()) >= 0
}

/**
 * @param {Config} config
                            * @param {number} id
                            * @returns {Recipe[]}
                            */
function materialUsedByRecipes(config, id) {
    return config.recipes.filter(r => (r.ingredients ?? []).filter(i => +i.id == +id).length > 0)
}

/**
 * @param {Config} config
                            * @param {number} id
                            * @returns {Recipe[]}
                            */
function factoryMakesRecipes(config, id) {
    return config.recipes.filter(r => r.factoryId == id)
}

/**
 * @param {Config} config 
 * @param {number} id
 * @returns {Recipe[]}
 */
function materialMadeByRecipes(config, id) {
    return config.recipes.filter(r => r.materialId == id)
}

function deleteRecipe(recipe) {
    const cfg = config()
    if (materialUsedByRecipes(cfg, recipe.materialId).length > 0) {
        alert("Rezept wird verwendet, kann nicht gelöscht werden")
    } else {
        cfg.recipes = cfg.recipes.filter(r => r != recipe)
        updateLocalConfig(cfg)
    }
}

/**
 * @param {string} text
                            */
function sluggy(text) {
    return text?.toLowerCase() ?? "" // TODO make this better
}

function displayRecipes(filter = "") {
    const rootElementName = "recipes"
    if (!filter) {
        filter = document.querySelector("filter input")?.value ?? ""
    }
    const root = document.querySelector(rootElementName)
    if (!root) {
        alert(`could not find root ${rootElementName}`)
        return
    }
    root.innerHTML = ""
    const cfg = config()
    cfg.recipes.sort((a, b) => a.name.localeCompare(b.name))
    for (const recipe of cfg.recipes.filter(r => filterRecipes(cfg, r, filter))) {
        root.appendChild(recipeCard(recipe, cfg))
    }
}

function recipeCard(recipe, cfg) {
    return n('a',
        [n('div', [
            n('div', [
                n('div', [(60 / +recipe.time) * recipe.quantity, '/min']),
                n('div', [recipe.quantity, '/', recipe.time, 's']),
            ], { style: "float:right; text-align:right; margin-left:2px;" }),
            n('div', [
                n('div', [
                    n('b', [recipe.name], { style: "color: var(--color-link); hyphens: auto;" }),
                ]),
            ], {
                style: "display:flex; justify-content: space-between;"
            }),
            n('span', [factoryById(cfg, recipe.factoryId)?.name ?? 'unbekannte Fabrik']),
            n('br'),
            ...(recipe.ingredients?.map(i => {
                return renderIngredient(i, cfg)
            }) ?? [])
        ], { "class": "recipe-card" })],
        {
            "href": "#recipe/" + recipe.id + '-' + sluggy(recipe.name),
            "class": "block"
        }
    )
}

function displayFilter(root) {
    root.innerHTML = ""
    const eh = (event) => displayRecipes(event.target.value)
    root.append(n('input', [], { placeholder: 'Filter', $input: eh }, "recipes-filter-input"))
}

function renderIngredient(ingredient, cfg) {
    const m = cfg.materials.filter(m => +m.id == +ingredient.id)?.[0]
    if (!m) {
        console.log('missing material for', ingredient)
        return n('div', [n('b', ingredient.id), ' ', ingredient.amount])
    }
    return n('div', [n('b', m.name), ' ', ingredient.amount])
}

function displayConfig() {
    displayInfo(document.querySelector("info"))
    displayRecipes()
    displayFilter(document.querySelector("filter"))
    navigate(new URL(window.location.href), false)
}

function openDialog(id) {
    const el = document.querySelector("dialog#" + id)
    if (el && el instanceof HTMLDialogElement) {
        el.showModal()
    }
}

function techtree(options, recipes) {
    const defaults = {
        distance: 100,
        strength: -800,
        forceX: 0,
        forceY: 0
    }
    // Specify the dimensions of the chart.
    const width = 1000;
    const height = 1000;

    const mo = Object.assign(defaults, options)
    const nodes = recipes.map((r, i) => ({ id: +r.materialId, name: r.name, primary: r.primary ?? false, ...(r.primary ? { fx: -(width / 4), fy: -(height / 4) } : {}) }))

    const links = []
    for (const recipe of recipes) {
        recipe.ingredients?.forEach(i => {
            if (!nodes.find(n => n.id == +i.id)) {
                nodes.push({ id: +i.id, name: 'unbekannt' })
            }
            links.push({
                target: +recipe.materialId,
                source: +i.id,
                level: recipe.level
            })
        })
    }

    // Specify the color scale.
    const maxLevel = Math.max(...links.map(r => r.level).filter(Boolean), 0)
    //const color = d3.scaleLinear([0, Math.ceil(maxLevel / 2), maxLevel], ["red", "yellow", "blue"])
    //const color = d3.scaleSequential(d3.interpolateRainbow)

    // @ts-ignore
    const d3 = window.d3
    const color = d3.scaleLinear([0, 1], ["red", "blue"])

    // Create a simulation with several forces.
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(mo.distance))
        .force("charge", d3.forceManyBody().strength(mo.strength))
        .force("x", d3.forceX(mo.forceX))
        .force("y", d3.forceY(mo.forceY));

    // Create the SVG container.
    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .attr("style", "max-width: 100%; height: auto; background:#cacaca")
    svg.append('defs').html(`
                            <marker
                                id="arrow"
                                viewBox="0 0 10 10"
                                refX="10"
                                refY="5"
                                markerWidth="10"
                                markerHeight="10"
                                orient="auto-start-reverse">
                                <path d="M 0 2 L 10 5 L 0 8 z" />
                            </marker>
                            `);

    // Add a line for each link, and a text for each node.
    const link = svg.append("g")
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => d.level === undefined ? '#999' : color((d.level ?? 0) / (maxLevel == 0 ? 1 : maxLevel)))
        .attr("marker-end", "url(#arrow)")
        .attr("level", d => d.level)
        .attr("stroke-width", "2")

    const node = svg.append("g")
        .attr("stroke", "#dadada")
        .attr("stroke-width", 4)
        .selectAll("text")
        .data(nodes)
        .join("text")
        .text(d => d.name)
        .attr("r", 5)
        //.attr("dx", -50)
        .attr("dx", 10)
        .attr("fill", d => d.primary ? 'green' : '#3a3a3a')
        .attr("paint-order", "stroke")

    // node.insert("text")
    //     .text(d => d.name)
    //     .attr("fill", "red")
    //     .attr("x", 0)
    //     .attr("y", 0)

    node.append("title")
        .text(d => d.name);

    // Add a drag behavior.
    node.call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Reheat the simulation when drag starts, and fix the subject position.
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    // Update the subject (dragged node) position during drag.
    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    // Restore the target alpha so the simulation cools after dragging ends.
    // Unfix the subject position now that it’s no longer being dragged.
    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    // Set the position attributes of links and nodes each time the simulation ticks.
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("x", d => d.x)
            .attr("y", d => d.y);

    });


    const g = svg.selectAll("g");

    svg.call(d3.zoom()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0, 8])
        .on("zoom", zoomed));

    function zoomed({ transform }) {
        g.attr("transform", transform);
    }

    return svg.node()
}
