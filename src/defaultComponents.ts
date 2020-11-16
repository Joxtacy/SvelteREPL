import type { Component } from "./types";

export const componentApp: Component = {
    id: 0,
    name: "App",
    type: "svelte",
    source: `<script>
    import Component from './Component1.svelte';
<\/script>

<Component name={"SvelteREPL"}/>`,
};

export const component1: Component = {
    id: 1,
    name: "Component1",
    type: "svelte",
    source: `<script>
    export let name = "World";
</script>

<h1>Hello {name}</h1>`,
};
