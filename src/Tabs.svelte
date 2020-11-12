<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { Tab } from "./types";

    interface TabDispatcher {
        select: number;
        new: void;
    }

    const dispatch = createEventDispatcher<TabDispatcher>();

    export let tabs: Tab[] = [];
    export let current: number = 0;
</script>

<ul>
    {#each tabs as { name, type, id }}
        <li
            class:active={id === current}
            on:click={() => dispatch('select', id)}>
            {name}.{type}
        </li>
    {/each}
    <li><button on:click={() => dispatch('new')}>+</button></li>
</ul>

<style>
    li {
        cursor: pointer;
    }

    .active {
        font-weight: 900;
        text-decoration: underline;
    }
</style>