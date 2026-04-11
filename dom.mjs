//@ts-check

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

export function n(type, children = [], opts = {}) {
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


export function displayModal(content) {
    const dialog = n('dialog', [content], { $close: () => dialog.remove() })
    document.body.append(dialog)
    dialog.showModal()
}

export const fieldFn = (label, opts) => n('label', [n('span', [label]), n('input', [], opts)])