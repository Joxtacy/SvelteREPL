<script lang="ts">
    import "./global.css";
    import Input from "./Input.svelte";
    import Output from "./Output.svelte";
    import type { Component } from "./types";

    let components: Component[] = [
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
    ];

    let current: number = 0;
</script>

<style>
</style>

<main>
    <Input bind:components bind:current />
    <Output />
</main>
