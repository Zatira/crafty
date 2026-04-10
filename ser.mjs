/**
 * https://stackoverflow.com/a/79016027
 * Provides a `JSON.stringify` replacer function that supports Map and Set object serialization.
 *
 * This replacer function fully supports Map and Set nesting as well as mixed values (including
 * regular objects) as opposed to the popular solution recommended at MDN and described in more
 * detail here: https://stackoverflow.com/q/29085197.
 *
 * Map and Set objects are serialized as plain JSON arrays where the first element is a special
 * token string (`@Map` or `@Set`, respectively), and all subsequent elements are either `[key,
 * value]` arrays (with the Map contents) or just `value` sequences (with the Set contents). To
 * avoid ambiguity, regular arrays with the first element equal to one of the token strings will
 * have the `@Array` token string prepended to their contents when serialized.
 *
 * The reverse #jsonMapSetReviver function will undo these operations when parsing the resulting
 * JSON data, so it must always be used when deserializing data serialized with #jsonMapSetReplacer
 * (even if there are no Map or Set objects, because there may be arrays with `@Array` prepended).
 *
 * This implementation seems to be faster than other alternatives almost in all cases (taking its
 * functionality into account). It is also published at https://stackoverflow.com/a/79016027/3579458
 * (there are some tests).
 */
function jsonMapSetReplacer(_, value_) {
    if (typeof (value_) === 'object') {
        if (value_ instanceof Map) {
            value_ = Array.from(value_);
            value_.unshift('@Map');
        }
        else if (value_ instanceof Set) {
            value_ = Array.from(value_);
            value_.unshift('@Set');
        }
        else if (Array.isArray(value_) && value_.length > 0 &&
            (value_[0] === '@Map' || value_[0] === '@Set' || value_[0] === '@Array')) {
            value_ = value_.slice();
            value_.unshift('@Array');
        }
    }

    return value_;
}


/**
 * https://stackoverflow.com/a/79016027
 * Provides a `JSON.parse` reviver function that supports Map and Set object deserialization.
 *
 * Must be used to deserialize JSON data serialized using #jsonMapSetReplacer.
 */

function jsonMapSetReviver(_, value_) {
    if (Array.isArray(value_) && value_.length > 0) {
        let isMap, isSet;
        if ((isMap = value_[0] === '@Map') || (isSet = value_[0] === '@Set') || value_[0] === '@Array') {
            value_.shift();
            if (isMap)
                value_ = new Map(value_);
            else if (isSet)
                value_ = new Set(value_);
        }
    }

    return value_;
}

export function serialize(obj) {
    return JSON.stringify(obj, jsonMapSetReplacer)
}

export function deserialize(str) {
    return JSON.parse(str, jsonMapSetReviver)
}