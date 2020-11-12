<script lang="ts">
    import type { Component } from "./types";
    import Tabs from "./Tabs.svelte";

    export let components: Component[] = [];
    export let current: number = 0;

    let textarea: HTMLTextAreaElement;

    $: currentComponentId = components.findIndex(({ id }) => id === current);
    $: tabs = components.map(({ id, name, type }) => ({ id, name, type }));

    function getMax(_components: Component[]): number {
        const ids = _components.map(({ id }) => id);
        return Math.max(...ids);
    }

    function newComponent() {
        const id = getMax(components) + 1;

        components = components.concat({
            id,
            name: `Component${id}`,
            type: "svelte",
            source: `<script>
<\/script>

<style>
<\/style>`,
        });

        current = id;
        textarea.focus();
    }
</script>

<section>
    <Tabs
        {tabs}
        {current}
        on:select={({ detail }) => (current = detail)}
        on:new={newComponent} />
    <textarea
        bind:value={components[currentComponentId].source}
        bind:this={textarea} />
</section>
