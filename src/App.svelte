<script lang="ts">
    import "./global.css";
    import MyWorker from "./worker?worker";
    import Input from "./Input.svelte";
    import Output from "./Output.svelte";
    import type { Component } from "./types";

    const worker = new MyWorker();

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

    worker.addEventListener("message", async (event: MessageEvent<string>): Promise<void> => {
        console.log(event.data);
    });

    function compile(_components: Component[]): void {
        worker.postMessage(_components);
    }

    $: compile(components);
</script>

<style>
</style>

<main>
    <Input bind:components bind:current />
    <Output />
</main>
