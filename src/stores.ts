import { Writable, writable, get, derived } from "svelte/store";
import type { Component, JsonValue, Tab, UnaryOperator } from "./types";

/**
 * This function creates a Svelte store that also saves its data
 * in LocalStorage using the provided key.
 * Note: This function will probably not work as expected
 * if there already is an object in LocalStorage with the same key.
 *
 * @param key a string for the LocalStorage
 * @param initial the initial value to for the store
 *
 * @return a Svelte Writable store
 */
const createLocalStore = <T>(key: string, initial: T): Writable<T> => {
    const toString = (value: T) => JSON.stringify(value, null, 2);
    const toObject = JSON.parse;

    if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, toString(initial));
    }
    const saved = toObject(localStorage.getItem(key));

    const store = writable<T>(saved);
    const { subscribe, set } = store;

    const localSet = (value: T) => {
        localStorage.setItem(key, toString(value));
        set(value);
    };

    const localUpdate = (updater: UnaryOperator<T>) => {
        const updated = updater(get(store));
        localSet(updated);
    };

    return {
        subscribe,
        update: localUpdate,
        set: localSet,
    };
};

export const codeStore = createLocalStore<Component[]>("code", [
    {
        id: 0,
        name: "App",
        type: "svelte",
        source: `<script>
    import Component from './Component1.svelte';
<\/script>

<Component />`,
    },
    {
        id: 1,
        name: "Component1",
        type: "svelte",
        source: "<h1>Hello REPL</h1>",
    },
]);

export const tabsStore = derived<Writable<Component[]>, Tab[]>(
    codeStore,
    ($codeStore) => $codeStore.map(({ id, name, type }) => ({ id, name, type }))
);
