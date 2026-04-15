/**
 * @template T
 * @typedef {Object} Signal
 * @property {T} value
 * @property {any} subscribe
 */

/**
 * @template T
 * @param {T} [initial] 
 * @returns {Signal<T|null>}
 */
export const signal = (initial) => {
    let value = initial
    const subs = new Set()

    return {
        get value() {
            return value
        },
        set value(v) {
            if (value === v) return
            value = v
            for (const fn of Array.from(subs)) fn(v)
        },
        subscribe(fn) {
            subs.add(fn)
            if (value) {
                fn(value)
            }
            return () => subs.delete(fn)
        }
    }
}

export const computed = (fn) => {
    let cachedValue
    const _internalCompute = () => {
        cachedValue = fn()
    }
    return {
        get value() {
            _internalCompute()
            return cachedValue
        }
    }
}