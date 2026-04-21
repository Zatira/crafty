//@ts-check

import { signal } from "./signals.mjs";

export function r(type, children = [], opts = {}) {
    const el = document.createElement(type)
    return () => {
        el.innerHTML = ''
        el.append(...children.map(child => {
            if (typeof child == "function") {
                return child()
            }
            return child
        }))
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
        return el
    };
}

const staticElements = new Map()

function createEl(type, staticId) {
    let el
    if (staticId != "") {
        el = staticElements.get(staticId)
        if (!el) {
            el = document.createElement(type)
            staticElements.set(staticId, el)
        }
    } else {
        el = document.createElement(type)
    }
    return el;
}

export function n(type, children = [], opts = {}, staticId = "") {
    const el = createEl(type, staticId)
    if (Array.isArray(children)) {
        el.replaceChildren(...children)
    } else {
        el.replaceChildren(children)
    }
    if (type === "button" && !opts.type) {
        opts.type = "button"
    }
    for (const [key, value] of Object.entries(opts)) {
        if (key === 'value') {
            if (value != undefined) {
                el.setAttribute(key, value)
                el.value = value
            }
        } else if (key === 'checked') {
            if (value != undefined && value != false) {
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


export function displayModal(content) {
    const afterRemove = signal()
    const dialog = n('dialog', [content], { $close: () => { dialog.remove(); afterRemove.value = true } })
    document.body.append(dialog)
    dialog.showModal()
    return afterRemove;
}

export const fieldFn = (label, opts, staticId = "") => n('label', [n('span', [label]), n('input', [], opts, staticId)])