<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { Tab } from "./types";

    interface TabDispatcher {
        select: number;
        new: void;
        del: number;
    }

    const dispatch = createEventDispatcher<TabDispatcher>();

    export let tabs: Tab[] = [];
    export let current: number = 0;
</script>

<style>
    ul {
        margin-bottom: 0;
    }

    li {
        cursor: pointer;
    }

    button {
        text-decoration: initial;
        margin-left: 5px;
    }

    .active {
        font-weight: 900;
        text-decoration: underline;
    }
</style>

<ul>
    {#each tabs as { name, type, id }, index}
        <li
            class:active={id === current}
            on:click={() => dispatch('select', id)}>
            {name}.{type}
            {#if index !== 0}
                <button on:click={() => dispatch('del', id)}>x</button>
            {/if}
        </li>
    {/each}
    <li><button on:click={() => dispatch('new')}>+</button></li>
</ul>
