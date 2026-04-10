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

const count = signal(1)
const doubleCount = computed(() => count.value * 2)
const plusOne = computed(() => doubleCount.value + 1)

count.subscribe((n) => console.log("changed", n))

// Update the signal…
count.value = 5

console.log(doubleCount.value) // 10
console.log(plusOne.value) // 11