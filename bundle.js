var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src/Tabs.svelte generated by Svelte v3.29.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i].name;
    	child_ctx[6] = list[i].type;
    	child_ctx[7] = list[i].id;
    	return child_ctx;
    }

    // (9:4) {#each tabs as { name, type, id }}
    function create_each_block(ctx) {
    	let li;
    	let t0_value = /*name*/ ctx[5] + "";
    	let t0;
    	let t1;
    	let t2_value = /*type*/ ctx[6] + "";
    	let t2;
    	let mounted;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[3](/*id*/ ctx[7], ...args);
    	}

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = text(".");
    			t2 = text(t2_value);
    			attr(li, "class", "svelte-1sfnb3x");
    			toggle_class(li, "active", /*id*/ ctx[7] === /*current*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);
    			append(li, t2);

    			if (!mounted) {
    				dispose = listen(li, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*tabs*/ 1 && t0_value !== (t0_value = /*name*/ ctx[5] + "")) set_data(t0, t0_value);
    			if (dirty & /*tabs*/ 1 && t2_value !== (t2_value = /*type*/ ctx[6] + "")) set_data(t2, t2_value);

    			if (dirty & /*tabs, current*/ 3) {
    				toggle_class(li, "active", /*id*/ ctx[7] === /*current*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment(ctx) {
    	let ul;
    	let t0;
    	let li;
    	let button;
    	let mounted;
    	let dispose;
    	let each_value = /*tabs*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			li = element("li");
    			button = element("button");
    			button.textContent = "+";
    			attr(li, "class", "svelte-1sfnb3x");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			append(ul, t0);
    			append(ul, li);
    			append(li, button);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler_1*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*tabs, current, dispatch*/ 7) {
    				each_value = /*tabs*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, t0);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	
    	const dispatch = createEventDispatcher();
    	let { tabs = [] } = $$props;
    	let { current = 0 } = $$props;
    	const click_handler = id => dispatch("select", id);
    	const click_handler_1 = () => dispatch("new");

    	$$self.$$set = $$props => {
    		if ("tabs" in $$props) $$invalidate(0, tabs = $$props.tabs);
    		if ("current" in $$props) $$invalidate(1, current = $$props.current);
    	};

    	return [tabs, current, dispatch, click_handler, click_handler_1];
    }

    class Tabs extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { tabs: 0, current: 1 });
    	}
    }

    /* src/Input.svelte generated by Svelte v3.29.0 */

    function create_fragment$1(ctx) {
    	let section;
    	let tabs_1;
    	let t;
    	let textarea_1;
    	let current;
    	let mounted;
    	let dispose;

    	tabs_1 = new Tabs({
    			props: {
    				tabs: /*tabs*/ ctx[4],
    				current: /*current*/ ctx[1]
    			}
    		});

    	tabs_1.$on("select", /*select_handler*/ ctx[7]);
    	tabs_1.$on("new", /*newComponent*/ ctx[6]);

    	return {
    		c() {
    			section = element("section");
    			create_component(tabs_1.$$.fragment);
    			t = space();
    			textarea_1 = element("textarea");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			mount_component(tabs_1, section, null);
    			append(section, t);
    			append(section, textarea_1);
    			set_input_value(textarea_1, /*components*/ ctx[0][/*currentComponentId*/ ctx[3]].source);
    			/*textarea_1_binding*/ ctx[9](textarea_1);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(textarea_1, "keydown", /*keydownHandler*/ ctx[5]),
    					listen(textarea_1, "input", /*textarea_1_input_handler*/ ctx[8])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			const tabs_1_changes = {};
    			if (dirty & /*tabs*/ 16) tabs_1_changes.tabs = /*tabs*/ ctx[4];
    			if (dirty & /*current*/ 2) tabs_1_changes.current = /*current*/ ctx[1];
    			tabs_1.$set(tabs_1_changes);

    			if (dirty & /*components, currentComponentId*/ 9) {
    				set_input_value(textarea_1, /*components*/ ctx[0][/*currentComponentId*/ ctx[3]].source);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(tabs_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(tabs_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			destroy_component(tabs_1);
    			/*textarea_1_binding*/ ctx[9](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function getMax(_components) {
    	const ids = _components.map(({ id }) => id);
    	return Math.max(...ids);
    }

    function instance$1($$self, $$props, $$invalidate) {
    	
    	let { components = [] } = $$props;
    	let { current = 0 } = $$props;
    	let textarea;

    	function keydownHandler(event) {
    		if (event.key == "Tab") {
    			event.preventDefault();
    			var start = textarea.selectionStart;
    			var end = textarea.selectionEnd;

    			// set textarea value to: text before caret + tab + text after caret
    			const spaceTab = `    `;

    			$$invalidate(2, textarea.value = `${textarea.value.substring(0, start)}${spaceTab}${textarea.value.substring(end)}`, textarea);

    			// put caret at right position again
    			$$invalidate(2, textarea.selectionStart = $$invalidate(2, textarea.selectionEnd = start + spaceTab.length, textarea), textarea);
    		}
    	}

    	function newComponent() {
    		const id = getMax(components) + 1;

    		$$invalidate(0, components = components.concat({
    			id,
    			name: `Component${id}`,
    			type: "svelte",
    			source: `<script>
<\/script>

<style>
<\/style>`
    		}));

    		$$invalidate(1, current = id);
    		textarea.focus();
    	}

    	const select_handler = ({ detail }) => $$invalidate(1, current = detail);

    	function textarea_1_input_handler() {
    		components[currentComponentId].source = this.value;
    		$$invalidate(0, components);
    		(($$invalidate(3, currentComponentId), $$invalidate(0, components)), $$invalidate(1, current));
    	}

    	function textarea_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			textarea = $$value;
    			$$invalidate(2, textarea);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("components" in $$props) $$invalidate(0, components = $$props.components);
    		if ("current" in $$props) $$invalidate(1, current = $$props.current);
    	};

    	let currentComponentId;
    	let tabs;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*components, current*/ 3) {
    			 $$invalidate(3, currentComponentId = components.findIndex(({ id }) => id === current));
    		}

    		if ($$self.$$.dirty & /*components*/ 1) {
    			 $$invalidate(4, tabs = components.map(({ id, name, type }) => ({ id, name, type })));
    		}
    	};

    	return [
    		components,
    		current,
    		textarea,
    		currentComponentId,
    		tabs,
    		keydownHandler,
    		newComponent,
    		select_handler,
    		textarea_1_input_handler,
    		textarea_1_binding
    	];
    }

    class Input extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { components: 0, current: 1 });
    	}
    }

    /* src/Output.svelte generated by Svelte v3.29.0 */

    function create_fragment$2(ctx) {
    	let section;
    	let iframe_1;

    	return {
    		c() {
    			section = element("section");
    			iframe_1 = element("iframe");
    			attr(iframe_1, "title", "Rendered REPL");
    			attr(iframe_1, "srcdoc", /*srcdoc*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, iframe_1);
    			/*iframe_1_binding*/ ctx[3](iframe_1);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(section);
    			/*iframe_1_binding*/ ctx[3](null);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { compiled } = $$props;
    	let iframe;

    	function update(code) {
    		iframe.contentWindow.postMessage(code, "*");
    	}

    	const srcdoc = `
<!DOCTYPE html>
<head>
    <script type="module">

        let c;

        function update(source) {
            const blob = new Blob([source], { type: "text/javascript" });
            const url = URL.createObjectURL(blob);

            import(url).then(({ default: App }) => {
                if (c) {
                    c.$destroy();
                }

                document.body.innerHTML = "";
                c = new App({
                    target: document.body
                });
            })
        }
        window.addEventListener("message", (event) => {
            update(event.data);
        }, false);
    <\/script>
<\/head>
<body><\/body>
<\/html>`;

    	function iframe_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			iframe = $$value;
    			$$invalidate(0, iframe);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("compiled" in $$props) $$invalidate(2, compiled = $$props.compiled);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*iframe, compiled*/ 5) {
    			 iframe && compiled && update(compiled);
    		}
    	};

    	return [iframe, srcdoc, compiled, iframe_1_binding];
    }

    class Output extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { compiled: 2 });
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

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
    const createLocalStore = (key, initial) => {
        const toString = (value) => JSON.stringify(value, null, 2);
        const toObject = JSON.parse;
        if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, toString(initial));
        }
        const saved = toObject(localStorage.getItem(key));
        const store = writable(saved);
        const { subscribe, set } = store;
        const localSet = (value) => {
            localStorage.setItem(key, toString(value));
            set(value);
        };
        const localUpdate = (updater) => {
            const updated = updater(get_store_value(store));
            localSet(updated);
        };
        return {
            subscribe,
            update: localUpdate,
            set: localSet,
        };
    };
    const codeStore = createLocalStore("code", [
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

    /* src/App.svelte generated by Svelte v3.29.0 */

    function create_fragment$3(ctx) {
    	let main;
    	let input;
    	let updating_components;
    	let updating_current;
    	let t;
    	let output;
    	let current;

    	function input_components_binding(value) {
    		/*input_components_binding*/ ctx[3].call(null, value);
    	}

    	function input_current_binding(value) {
    		/*input_current_binding*/ ctx[4].call(null, value);
    	}

    	let input_props = {};

    	if (/*$codeStore*/ ctx[2] !== void 0) {
    		input_props.components = /*$codeStore*/ ctx[2];
    	}

    	if (/*current*/ ctx[0] !== void 0) {
    		input_props.current = /*current*/ ctx[0];
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "components", input_components_binding));
    	binding_callbacks.push(() => bind(input, "current", input_current_binding));
    	output = new Output({ props: { compiled: /*compiled*/ ctx[1] } });

    	return {
    		c() {
    			main = element("main");
    			create_component(input.$$.fragment);
    			t = space();
    			create_component(output.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			mount_component(input, main, null);
    			append(main, t);
    			mount_component(output, main, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const input_changes = {};

    			if (!updating_components && dirty & /*$codeStore*/ 4) {
    				updating_components = true;
    				input_changes.components = /*$codeStore*/ ctx[2];
    				add_flush_callback(() => updating_components = false);
    			}

    			if (!updating_current && dirty & /*current*/ 1) {
    				updating_current = true;
    				input_changes.current = /*current*/ ctx[0];
    				add_flush_callback(() => updating_current = false);
    			}

    			input.$set(input_changes);
    			const output_changes = {};
    			if (dirty & /*compiled*/ 2) output_changes.compiled = /*compiled*/ ctx[1];
    			output.$set(output_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(input.$$.fragment, local);
    			transition_in(output.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(input.$$.fragment, local);
    			transition_out(output.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(input);
    			destroy_component(output);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $codeStore;
    	component_subscribe($$self, codeStore, $$value => $$invalidate(2, $codeStore = $$value));
    	
    	let current = 0;
    	let compiled;
    	const worker = new Worker("./worker.js");

    	worker.addEventListener("message", event => {
    		$$invalidate(1, compiled = event.data);
    	});

    	function compile(_components) {
    		worker.postMessage(_components);
    	}

    	function input_components_binding(value) {
    		$codeStore = value;
    		codeStore.set($codeStore);
    	}

    	function input_current_binding(value) {
    		current = value;
    		$$invalidate(0, current);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$codeStore*/ 4) {
    			 compile($codeStore);
    		}
    	};

    	return [current, compiled, $codeStore, input_components_binding, input_current_binding];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
