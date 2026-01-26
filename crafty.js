const defaultConfig = {
    recipes: [],
    factories: []
}

const FactoryDescription = {
    id: {
        transform: (v) => +v,
        type: 'auto'
    },
    name: {
        label: 'Name',
        type: 'input'
    }
}

const IngredientDescription = {
    id: {
        label: 'Zutat',
        type: 'select',
        source: 'recipes'
    },
    amount: {
        label: 'Menge',
        type: 'input',
        transform: (v) => +v
    }
}

const RecipeDescription = {
    id: {
        transform: (v) => +v,
        type: 'auto'
    },
    name: {
        label: 'Name',
        type: 'input'
    },
    factoryId: {
        label: 'Fabrik',
        type: 'select',
        source: 'factories'
    },
    ingredients: {
        type: 'array',
        item: IngredientDescription
    }
}

const state = {
    _config: null,
    configName: null,
    set config(config) {
        this._config = config
        displayConfig()
    },
    get config() {
        return this._config
    }
}

let markers = []
let markerList = null

function config() {
    return state.config
}

async function loadFile(event) {
    const formData = new FormData(event.target)
    const filehandle = formData.get("cfg")
    const content = await filehandle.text()
    readInfo(content, filehandle.name)
}

function init() {
    const fromStorage = localStorage.getItem("crafty")
    if (fromStorage) {
        const [parsedConfig, configName] = JSON.parse(fromStorage)
        markers = JSON.parse(localStorage.getItem('craftyMap') ?? '[]')
        state.config = Object.assign(structuredClone(defaultConfig), parsedConfig)
        state.configName = configName
    }
    navigate(new URL(window.location.href))
    hookIntoNav()
}

function navigate(url) {
    const hash = url.hash
    if (hash && hash.startsWith("#")) {
        const sansPound = hash.substring(1)
        if (sansPound.indexOf("/") == -1) {
            renderMain(sansPound, null)
        } else {
            const type = sansPound.substring(0, sansPound.indexOf("/"))
            const id = hash.substring(hash.indexOf("/") + 1, hash.indexOf("-"))
            renderMain(type, id)
        }
    }
    document.scrollingElement.scrollTop = 0
}

function renderMain(type, id) {
    const root = document.querySelector('outlet')
    const node = mainNodeByType(type, id)
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
            return renderRecipe(id)
        case 'tree':
            return renderTechTree()
        case 'map':
            return renderMap()
        default:
            return renderOops()
    }
}

function sortTable(id, n) {
    const table = document.getElementById(id);
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
        elements.push({ row, v: el.innerText });
    }
    elements.sort((a, b) => {
        const literal = b.v - a.v
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

function recipeLink(recipe) {
    return n('a', [recipe.name], { href: '#recipe/' + recipe.id + '-' + sluggy(recipe.name) })
}

function factoryLink(factory) {
    return n('a', [factory.name], { href: '#factory/' + factory.id + '-' + sluggy(factory.name) })
}

function updateScroll() {
    if (!isDragging) return;

    const dx = currentX - startX;
    const dy = currentY - startY;

    sContainer.scrollLeft = startScrollLeft - dx;
    sContainer.scrollTop = startScrollTop - dy;

    rafId = requestAnimationFrame(updateScroll);
}


let isDragging = false;
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;
let currentX = 0;
let currentY = 0;
let rafId = null;
let sContainer;

function renderMap() {

    const maxX = 16
    const maxY = 16
    const tileWidth = 256
    const tiles = []

    function markerForm(marker) {

        const deleteBtn = n('div', [
            n('button', ['Löschen 🪣'], {
                type: "button", $click: (event) => {
                    removeMarker(marker)
                    event.target.closest('dialog').close()
                }
            }),
        ], { style: "display:flex; justify-content:end; gap:10px;" })

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
                    n('button', ['Abbrechen'], { type: "button", $click: (event) => event.target.closest('dialog').close() }),
                    n('button', ['OK'], { type: "submit" })
                ], { style: "display:flex; justify-content:end; gap:10px;" }),
            ], { $submit: (event) => submitMarker(event), class: "formRows", method: "dialog" }),
            n('br')
        ])
        return form
    }

    function editMarker(marker) {
        const dialog = n('dialog', [markerForm(marker)], { $close: (event) => dialog.remove() })
        document.body.append(dialog)
        dialog.showModal()
    }

    function removeMarker(marker) {
        const markerIndex = markers.findIndex(m => m.id == marker.id)
        if (markerIndex != -1) {
            markers.splice(markerIndex, 1)
            renderMarkers()
            saveInternal()
        }
    }

    function submitMarker(event) {
        event.preventDefault()
        const formData = new FormData(event.target)
        const element = mergeForm(formData, {})
        const collection = markers
        const inserted = upsert(collection, element, event)
        if (!inserted) {
            return false
        }
        renderMarkers()
        saveInternal()
        event.target.closest('dialog').close()
    }

    function renderMarkers() {
        markerList.innerHTML = '';
        [...(map.querySelectorAll('span.mapMarker'))].forEach(node => node.remove())
        markers.forEach(m => renderMarker(m, map))
    }

    const renderMarker = (md, map) => {
        const markerEditButton = n('button', ['✏️'], { '$click': () => editMarker(md), class: 'fab' })
        const markerLink = n('a', [md.icon, " (", md.y, ",", md.x, ") - ", md.text], {
            $click: () => {
                sContainer.scrollTop = md.y - (sContainer.clientHeight / 2)
                sContainer.scrollLeft = md.x - (sContainer.clientWidth / 2)
            },
            style: "display:flex; flex-direction:col;"
        })
        const markerRow = n('div', [markerLink, markerEditButton], { style: "display:flex; gap:2rem; align-items:center;" })
        markerList.append(
            markerRow
        )
        map.append(n('span', [md.icon], { class: "mapMarker", title: md.text, style: `position: absolute; top: ${md.y}px; left: ${md.x}px; font-size: 1rem; line-height: 1rem` }))
    }

    const suppress = (event) => {
        event.stopPropagation()
        event.preventDefault()
        console.log('img', event)
    }

    for (let xi = 0; xi < maxX; xi++) {
        for (let yi = 0; yi < maxY; yi++) {
            tiles.push(n('img', [], { src: `./tiles/${yi}_${xi}.webp`, $click: suppress, style: "pointer-events:none; user-select:none" }))
        }
    }

    const map = n('div', tiles, { style: `width: ${maxX * tileWidth}px; height: ${maxY * tileWidth}px; font-size: 0; line-height: 0; position: relative;` })
    markerList = n('div')
    const container = n(
        'div',
        [map],
        {
            style: "overflow: auto; width: 600px; height: 600px;",
            $click: (event) => {
                event.stopPropagation()
                event.preventDefault()
            },
            $mousedown: (e) => {
                if (e.button !== 0) return;

                e.preventDefault();
                isDragging = true;

                sContainer.classList.add('dragging');

                startX = currentX = e.clientX;
                startY = currentY = e.clientY;
                startScrollLeft = sContainer.scrollLeft;
                startScrollTop = sContainer.scrollTop;

                rafId = requestAnimationFrame(updateScroll);
            },
            $mouseup: (e) => {
                if (!isDragging) return;

                isDragging = false;
                sContainer.classList.remove('dragging');

                cancelAnimationFrame(rafId);
            },
            $mousemove: (e) => {
                if (!isDragging) return;
                currentX = e.clientX;
                currentY = e.clientY;
            },
            $contextmenu: (event) => {
                if (event.target.nodeName.toLowerCase() == "span") {
                    event.preventDefault()
                    return
                }
                event.stopPropagation()
                event.preventDefault()
                const md = {
                    x: event.layerX,
                    y: event.layerY
                }
                editMarker(md)
            }
        }
    )
    sContainer = container
    setTimeout(() => {
        container.scrollTop = 1954
        container.scrollLeft = 915
    }, 1)
    renderMarkers()
    return n('div', [container, markerList])
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
                        console.log("That's a bust", e)
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
                        console.log("That's a bust", e)
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

function renderFactoryList() {
    const factories = config().factories
    return n('div', [
        n('h2', ['Fabriken 🏭']),
        n('table', [
            n('tr', [
                n('th', ['Name'], { $click: () => sortTable('factoryTbl', 0) }),
                n('th', ['Strom'], { $click: () => sortTable('factoryTbl', 1) }),
                n('th', ['Hitze'], { $click: () => sortTable('factoryTbl', 2) })
            ]),
            ...factories.map(f => n('tr', [
                n('td', [factoryLink(f)]),
                n('td', [f.power], { style: 'color: cyan' }),
                n('td', [f.heat], { style: 'color: coral' })
            ]))
        ], { id: 'factoryTbl' })
    ])
}

function renderFactory(id) {
    const factory = factoryById(config(), +id)
    const recipies = factoryMakesRecipes(config(), id)
    const recipeNodes = []
    for (const recipie of recipies) {
        recipeNodes.push(n('br'))
        recipeNodes.push(recipeLink(recipie))
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
        n('p', ['Stellt her: ', ...recipeNodes])
    ])
}

function renderRecipe(id) {
    const recipe = recipeById(config(), id)
    const dependantRecipies = [{ ...recipe, primary: true, level: 0 }]
    const edge = [{ ...recipe, level: 0 }]
    while (edge.length > 0) {
        const r = edge.shift();
        (r.ingredients ?? []).forEach(i => edge.push({ ...recipeById(config(), i.id), level: r.level + 1 }));
        if (dependantRecipies.find(d => +d.id === +r.id) == undefined) {
            dependantRecipies.push(r);
        }
    }
    const recipeFactory = factoryById(config(), recipe.factoryId)
    const recipeNodes = []
    for (const recipe of recipeUsedByRecipes(config(), id)) {
        recipeNodes.push(n('br'))
        recipeNodes.push(recipeLink(recipe))
    }
    return [
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
                n('p', ['Hergestellt in: ', factoryLink(recipeFactory)]),
                n('br'),
                n('p', ['Verwendet von: ', ...recipeNodes])
            ], { style: 'flex-grow:1' }),
            n('div', [
                n('h2', ['Zutaten']),
                ...(recipe.ingredients?.map(i => {
                    const r = config().recipes.filter(r => r.id == i.id)[0]
                    return n('div', [recipeLink(r), ' ', i.amount])
                }) ?? []),
            ]),
        ], { style: 'display:flex; gap: 10px; align-items:start; justify-content: space-between;' }),
        displayCalc(recipe.id),
        techtree({}, dependantRecipies)
    ]
}

function hookIntoNav() {
    navigation.addEventListener("navigate", (event) => {
        const url = new URL(event.destination.url);
        navigate(url)
    });
}

function readInfo(configContent, name) {
    try {
        const parsedConfig = JSON.parse(configContent)
        state.config = Object.assign(structuredClone(defaultConfig), parsedConfig)
        state.configName = name
    } catch (e) {
        console.log(e)
        alert("failed to read config", e)
        return
    }
    saveInternal()
}

function saveInternal() {
    localStorage.setItem("crafty", JSON.stringify([config(), sluggy(config().game)]))
    localStorage.setItem("craftyMap", JSON.stringify(markers))
}

function save() {
    const stringied = JSON.stringify(config())
    const fileName = "Crafty-" + sluggy(config().game) + '-' + new Date().getTime() + '.json'
    download(stringied, fileName, 'application/json')
}

function download(data, filename, type) {
    var file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
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
    state.config = newConfig
    state.configName = configName
    saveInternal()
    return true
}

function mergeForm(formData, target) {
    for (const [key, value] of formData.entries()) {
        if (key.indexOf('.') == -1) {
            target[key] = value
        } else {
            const [parentKey, index, subkey] = key.split('.')
            if (!target[parentKey]) {
                target[parentKey] = []
            }
            if (!target[parentKey][index]) {
                target[parentKey][index] = {}
            }
            target[parentKey][index][subkey] = value
        }
    }
    return target
}

function isNameUnique(event, collection) {
    const inp = event.target.querySelector('[name="name"]')
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
    const formData = new FormData(event.target)
    const element = mergeForm(formData, {})
    const collection = config().factories
    const inserted = upsert(collection, element, event)
    if (!inserted) {
        return false
    }
    state.config = config()
    saveInternal()
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
    state.config = config()
    saveInternal()
}

function addIngredient(event, parent, ingredient) {
    const parentDataset = parent.dataset
    const count = parentDataset['count'] ?? 0

    recipeChoices = () => config().recipes.map(r => n('option', [r.name], { value: r.id }))
    const newIngredient = n('div', [
        selectFn('Zutat', recipeChoices(), { name: `ingredients.${count}.id`, requierd: true, value: ingredient?.id ?? null }),
        fieldFn('Anzahl', { name: `ingredients.${count}.amount`, requierd: true, value: ingredient?.amount ?? null }),
    ], { style: "display: flex; gap: 0.5rem" })

    parent.appendChild(newIngredient)
    parentDataset['count'] = +count + 1
}

const fieldFn = (label, opts) => n('label', [n('span', [label]), n('input', [], opts)])
const selectFn = (label, choices, opts) => n('label', [n('span', [label]), n('select', choices, opts)])

function factoryForm(factory) {
    const form = n('div', [
        n('h2', ['Fabrik hinzufügen']),
        n('form', [
            n('div', [
                fieldFn('Name', { name: "name", requierd: true, value: factory.name })
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                fieldFn('Strom', { name: "power", requierd: true, value: factory.power }),
                fieldFn('Hitze', { name: "heat", requierd: true, value: factory.heat })
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                n('input', [], { value: factory.id, name: 'id', type: 'hidden' }),
                n('button', ['Abbrechen'], { type: "button", $click: (event) => event.target.closest('dialog').close() }),
                n('button', ['OK'], { type: "submit" })
            ], { style: "display:flex; justify-content:end; gap:10px;" }),
        ], { $submit: (event) => submitFactory(event), class: "formRows", method: "dialog" }),
        n('br')
    ])
    return form
}

function recipeForm(recipe) {
    factoryChoices = () => config().factories.map(f => n('option', [f.name], { value: f.id }))
    recipeChoices = () => config().recipes.map(r => n('option', [r.name], { value: r.id }))
    const ingredientNode = n('div')

    const form = n('div', [
        n('h2', ['Rezept hinzufügen']),
        n('form', [
            n('div', [
                fieldFn('Name', { name: "name", requierd: true, value: recipe.name }),
                selectFn('Factory', factoryChoices(), { name: "factoryId", requierd: true, value: recipe.factoryId })
            ], { style: "display: flex; gap: 0.5rem" }),
            n('div', [
                fieldFn('Anzahl', { name: "quantity", requierd: true, value: recipe.quantity }),
                fieldFn('Dauer', { name: "time", requierd: true, value: recipe.time })
            ], { style: "display: flex; gap: 0.5rem" }),
            ingredientNode,
            n('div', [
                n('button', ['neue Zutat'], { type: "button", $click: (event) => addIngredient(event, ingredientNode) })
            ]),
            n('div', [
                n('input', [], { value: recipe.id, name: 'id', type: 'hidden' }),
                n('button', ['Abbrechen'], { type: "button", $click: (event) => event.target.closest('dialog').close() }),
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

function displayCalc(id) {
    return n('calculation', [
        n('form', [
            n('input', [], { type: 'hidden', value: id, name: 'ingredient' }),
            n('label', ['Output: ', n('input', [], { name: 'amount', style: 'display:inline-block' }), ' pro Sekunde'], { style: 'display:inline-block' }),
            ' ',
            n('button', ['Go!'])
        ], { $submit: (event) => calculate(event) }),
        n('result')
    ])
}

function calcInner(recipe, amount) {
    const singleRate = (+(recipe.quantity) / +(recipe.time))
    return {
        recipeId: recipe.id,
        factoryId: recipe.factoryId,
        machines: amount / singleRate,
        amount,
        ingredients: recipe.ingredients?.map(i => calcInner(recipeById(config(), i.id), (amount * +(i.amount) / +(recipe.quantity))))
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
        n('i', [factory.name, ' x', p2(data.machines)]),
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
    console.log(factories)
    return n('div', [
        'Zusammenfassung Fabriken:',
        n('ul', [...factories.entries()].map(([id, amount]) => {
            const factory = factoryById(config(), id)
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

function calculate(event) {
    event.preventDefault()
    const formData = new FormData(event.target)
    const amount = +formData.get("amount")
    const recipeId = +formData.get("ingredient")
    const recipe = recipeById(config(), recipeId)

    const justData = calcInner(recipe, amount)

    const parts = []
    parts.push(renderCalcTree(justData))
    parts.push(renderFactorySummary(justData))

    res = document.querySelector("result")
    res.innerHTML = ''
    res.append(n('div', parts, { style: 'display:flex; gap: 10px; align-items:start; justify-content: space-between;' }))
}

function n(type, children = [], opts = {}) {
    const el = document.createElement(type)
    el.append(...children)
    for (const [key, value] of Object.entries(opts)) {
        if (key === 'value') {
            if (value != undefined) {
                el.setAttribute(key, value)
                el.value = value
            }
        } else if (key.startsWith('$')) {
            el.addEventListener(key.substring(1), value)
        } else if (key == 'class') {
            el.classList.add(...(value.split(' ')))
        } else {
            el.setAttribute(key, value)
        }
    }

    return el;
}

function editFactory(factory) {
    const dialog = n('dialog', [factoryForm(factory)], { $close: (event) => dialog.remove() })
    document.body.append(dialog)
    dialog.showModal()
}

function deleteFactory(factory) {
    const cfg = config()
    if (factoryMakesRecipes(cfg, factory.id).length > 0) {
        alert("Fabrik wird verwendet, kann nicht gelöscht werden")
    } else {
        // cfg.recipes = cfg.recipes.filter(r => r != recipe)
        // state.config = cfg
        console.log('can delete')
    }
}

function editRecipe(recipe) {
    const dialog = n('dialog', [recipeForm(recipe)], { $close: (event) => dialog.remove() })
    document.body.append(dialog)
    dialog.showModal()
}

function addRecipe() {
    const dialog = n('dialog', [recipeForm({})], { $close: (event) => dialog.remove() })
    document.body.append(dialog)
    dialog.showModal()
}

function addFactory() {
    const dialog = n('dialog', [factoryForm({})], { $close: (event) => dialog.remove() })
    document.body.append(dialog)
    dialog.showModal()
}

function recipeById(config, id) {
    return config.recipes.filter(r => r.id == id)[0]
}

function factoryById(config, id) {
    return config.factories.filter(f => f.id == id)[0]
}

function filterRecipes(config, recipe, filter) {
    return recipe.name.toLowerCase().indexOf(filter.toLowerCase()) >= 0
}

function recipeUsedByRecipes(config, id) {
    return config.recipes.filter(r => (r.ingredients ?? []).filter(i => +i.id == +id).length > 0)
}

function factoryMakesRecipes(config, id) {
    return config.recipes.filter(r => r.factoryId == id)
}

function deleteRecipe(recipe) {
    const cfg = config()
    if (recipeUsedByRecipes(cfg, recipe.id).length > 0) {
        alert("Rezept wird verwendet, kann nicht gelöscht werden")
    } else {
        // cfg.recipes = cfg.recipes.filter(r => r != recipe)
        // state.config = cfg
        console.log('can delete')
    }
}

function sluggy(text) {
    return text?.toLowerCase() // TODO make this better
}

function displayRecipes(filter = "") {
    const root = document.querySelector("recipes")
    root.innerHTML = ""
    const cfg = config()
    for (const recipe of cfg.recipes.filter(r => filterRecipes(cfg, r, filter))) {
        root.appendChild(n('a',
            [n('div', [
                n('b', [recipe.name]),
                n('br'),
                n('span', ['Fabrik: ', factoryById(cfg, recipe.factoryId).name]),
                n('br'),
                n('span', ['Output: ', recipe.quantity, '/', recipe.time, 's', " (", (60 / +recipe.time) * recipe.quantity, '/min)']),
                n('br'),
                ...(recipe.ingredients?.map(i => {
                    return renderIngredient(i, cfg)
                }) ?? [])
            ], { "class": "space-2 recipe-card" })],
            {
                "href": "#recipe/" + recipe.id + '-' + sluggy(recipe.name),
                "class": "block"
            }
        )
        )
    }
}

function displayFilter(root) {
    root.innerHTML = ""
    const eh = (event) => displayRecipes(event.target.value)
    root.append(n('input', [], { placeholder: 'Filter', $change: eh, $input: eh }))
}

function renderIngredient(ingredient, cfg) {
    const r = cfg.recipes.filter(r => +r.id == +ingredient.id)[0]
    return n('div', [n('b', r.name), ' ', ingredient.amount])
}

function displayConfig() {
    displayInfo(document.querySelector("info"))
    displayRecipes()
    displayFilter(document.querySelector("filter"))
}

function openDialog(id) {
    document.querySelector("dialog#" + id)?.showModal()
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
    const nodes = recipes.map((r, i) => ({ id: +r.id, name: r.name, primary: r.primary ?? false, ...(r.primary ? { fx: -(width / 4), fy: -(height / 4) } : {}) }))

    const links = []
    for (const recipe of recipes) {
        recipe.ingredients?.forEach(i => {
            links.push({
                target: +recipe.id,
                source: +i.id,
                level: recipe.level
            })
        })
        console.log(recipe)
    }

    // Specify the color scale.
    const maxLevel = Math.max(...links.map(r => r.level).filter(Boolean), 0)
    //const color = d3.scaleLinear([0, Math.ceil(maxLevel / 2), maxLevel], ["red", "yellow", "blue"])
    //const color = d3.scaleSequential(d3.interpolateRainbow)
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

    return svg.node()
}
