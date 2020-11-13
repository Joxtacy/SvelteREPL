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
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
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

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
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
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
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
    const tabsStore = derived(codeStore, ($codeStore) => $codeStore.map(({ id, name, type }) => ({ id, name, type })));

    /* src/Input.svelte generated by Svelte v3.29.0 */

    function create_fragment(ctx) {
    	let section;
    	let textarea_1;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			section = element("section");
    			textarea_1 = element("textarea");
    			attr(section, "class", "svelte-jzi2e1");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, textarea_1);
    			set_input_value(textarea_1, /*components*/ ctx[0][/*currentComponentId*/ ctx[2]].source);
    			/*textarea_1_binding*/ ctx[6](textarea_1);

    			if (!mounted) {
    				dispose = [
    					listen(textarea_1, "keydown", /*keydownHandler*/ ctx[3]),
    					listen(textarea_1, "input", /*textarea_1_input_handler*/ ctx[5])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*components, currentComponentId*/ 5) {
    				set_input_value(textarea_1, /*components*/ ctx[0][/*currentComponentId*/ ctx[2]].source);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(section);
    			/*textarea_1_binding*/ ctx[6](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	
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

    			$$invalidate(1, textarea.value = `${textarea.value.substring(0, start)}${spaceTab}${textarea.value.substring(end)}`, textarea);

    			// put caret at right position again
    			$$invalidate(1, textarea.selectionStart = $$invalidate(1, textarea.selectionEnd = start + spaceTab.length, textarea), textarea);
    		}
    	}

    	function textarea_1_input_handler() {
    		components[currentComponentId].source = this.value;
    		$$invalidate(0, components);
    		(($$invalidate(2, currentComponentId), $$invalidate(0, components)), $$invalidate(4, current));
    	}

    	function textarea_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			textarea = $$value;
    			$$invalidate(1, textarea);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("components" in $$props) $$invalidate(0, components = $$props.components);
    		if ("current" in $$props) $$invalidate(4, current = $$props.current);
    	};

    	let currentComponentId;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*components, current*/ 17) {
    			 $$invalidate(2, currentComponentId = components.findIndex(({ id }) => id === current));
    		}

    		if ($$self.$$.dirty & /*currentComponentId, textarea*/ 6) {
    			 if (currentComponentId > -1 && textarea) textarea.focus();
    		}
    	};

    	return [
    		components,
    		textarea,
    		currentComponentId,
    		keydownHandler,
    		current,
    		textarea_1_input_handler,
    		textarea_1_binding
    	];
    }

    class Input extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { components: 0, current: 4 });
    	}
    }

    /* src/Output.svelte generated by Svelte v3.29.0 */

    function create_fragment$1(ctx) {
    	let section;
    	let iframe_1;

    	return {
    		c() {
    			section = element("section");
    			iframe_1 = element("iframe");
    			attr(iframe_1, "title", "Rendered REPL");
    			attr(iframe_1, "srcdoc", /*srcdoc*/ ctx[1]);
    			attr(section, "class", "svelte-15qmmmg");
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

    function instance$1($$self, $$props, $$invalidate) {
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
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { compiled: 2 });
    	}
    }

    /* src/Tabs.svelte generated by Svelte v3.29.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i].name;
    	child_ctx[7] = list[i].type;
    	child_ctx[8] = list[i].id;
    	child_ctx[10] = i;
    	return child_ctx;
    }

    // (34:12) {#if index !== 0}
    function create_if_block(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[3](/*id*/ ctx[8], ...args);
    	}

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "x";
    			attr(button, "class", "svelte-ld7opu");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (29:4) {#each tabs as { name, type, id }
    function create_each_block(ctx) {
    	let li;
    	let t0_value = /*name*/ ctx[6] + "";
    	let t0;
    	let t1;
    	let t2_value = /*type*/ ctx[7] + "";
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;
    	let if_block = /*index*/ ctx[10] !== 0 && create_if_block(ctx);

    	function click_handler_1(...args) {
    		return /*click_handler_1*/ ctx[4](/*id*/ ctx[8], ...args);
    	}

    	return {
    		c() {
    			li = element("li");
    			t0 = text(t0_value);
    			t1 = text(".");
    			t2 = text(t2_value);
    			t3 = space();
    			if (if_block) if_block.c();
    			attr(li, "class", "svelte-ld7opu");
    			toggle_class(li, "active", /*id*/ ctx[8] === /*current*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			append(li, t0);
    			append(li, t1);
    			append(li, t2);
    			append(li, t3);
    			if (if_block) if_block.m(li, null);

    			if (!mounted) {
    				dispose = listen(li, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*tabs*/ 1 && t0_value !== (t0_value = /*name*/ ctx[6] + "")) set_data(t0, t0_value);
    			if (dirty & /*tabs*/ 1 && t2_value !== (t2_value = /*type*/ ctx[7] + "")) set_data(t2, t2_value);
    			if (/*index*/ ctx[10] !== 0) if_block.p(ctx, dirty);

    			if (dirty & /*tabs, current*/ 3) {
    				toggle_class(li, "active", /*id*/ ctx[8] === /*current*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function create_fragment$2(ctx) {
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
    			attr(button, "class", "svelte-ld7opu");
    			attr(li, "class", "svelte-ld7opu");
    			attr(ul, "class", "svelte-ld7opu");
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
    				dispose = listen(button, "click", /*click_handler_2*/ ctx[5]);
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

    function instance$2($$self, $$props, $$invalidate) {
    	
    	const dispatch = createEventDispatcher();
    	let { tabs = [] } = $$props;
    	let { current = 0 } = $$props;
    	const click_handler = id => dispatch("del", id);
    	const click_handler_1 = id => dispatch("select", id);
    	const click_handler_2 = () => dispatch("new");

    	$$self.$$set = $$props => {
    		if ("tabs" in $$props) $$invalidate(0, tabs = $$props.tabs);
    		if ("current" in $$props) $$invalidate(1, current = $$props.current);
    	};

    	return [tabs, current, dispatch, click_handler, click_handler_1, click_handler_2];
    }

    class Tabs extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { tabs: 0, current: 1 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.29.0 */

    function create_fragment$3(ctx) {
    	let main;
    	let div0;
    	let tabs;
    	let t0;
    	let div1;
    	let input;
    	let updating_components;
    	let updating_current;
    	let t1;
    	let div2;
    	let output;
    	let current;

    	tabs = new Tabs({
    			props: {
    				tabs: /*$tabsStore*/ ctx[3],
    				current: /*current*/ ctx[0]
    			}
    		});

    	tabs.$on("select", /*select_handler*/ ctx[6]);
    	tabs.$on("new", /*newComponent*/ ctx[5]);
    	tabs.$on("del", /*del_handler*/ ctx[7]);

    	function input_components_binding(value) {
    		/*input_components_binding*/ ctx[8].call(null, value);
    	}

    	function input_current_binding(value) {
    		/*input_current_binding*/ ctx[9].call(null, value);
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
    			div0 = element("div");
    			create_component(tabs.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			create_component(input.$$.fragment);
    			t1 = space();
    			div2 = element("div");
    			create_component(output.$$.fragment);
    			attr(div0, "class", "tabs svelte-7erknf");
    			attr(div1, "class", "input svelte-7erknf");
    			attr(div2, "class", "output svelte-7erknf");
    			attr(main, "class", "svelte-7erknf");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div0);
    			mount_component(tabs, div0, null);
    			append(main, t0);
    			append(main, div1);
    			mount_component(input, div1, null);
    			append(main, t1);
    			append(main, div2);
    			mount_component(output, div2, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const tabs_changes = {};
    			if (dirty & /*$tabsStore*/ 8) tabs_changes.tabs = /*$tabsStore*/ ctx[3];
    			if (dirty & /*current*/ 1) tabs_changes.current = /*current*/ ctx[0];
    			tabs.$set(tabs_changes);
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
    			transition_in(tabs.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			transition_in(output.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(tabs.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			transition_out(output.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(tabs);
    			destroy_component(input);
    			destroy_component(output);
    		}
    	};
    }

    function getMax(_components) {
    	const ids = _components.map(({ id }) => id);
    	return Math.max(...ids);
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $codeStore;
    	let $tabsStore;
    	component_subscribe($$self, codeStore, $$value => $$invalidate(2, $codeStore = $$value));
    	component_subscribe($$self, tabsStore, $$value => $$invalidate(3, $tabsStore = $$value));
    	
    	let current = 0;
    	let compiled;
    	const worker = new Worker("./worker.js");

    	worker.addEventListener("message", event => {
    		$$invalidate(1, compiled = event.data);
    	});

    	function compile(_components) {
    		worker.postMessage(_components);
    	}

    	function deleteComponent(deleteId) {
    		$$invalidate(0, current = 0); // reset back to App.svelte
    		set_store_value(codeStore, $codeStore = $codeStore.filter(({ id }) => id !== deleteId), $codeStore);
    	}

    	function newComponent() {
    		const id = getMax($codeStore) + 1;

    		set_store_value(
    			codeStore,
    			$codeStore = $codeStore.concat({
    				id,
    				name: `Component${id}`,
    				type: "svelte",
    				source: "<h1>Hello REPL</h1>"
    			}),
    			$codeStore
    		);

    		$$invalidate(0, current = id);
    	}

    	const select_handler = ({ detail }) => $$invalidate(0, current = detail);
    	const del_handler = ({ detail }) => deleteComponent(detail);

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

    	return [
    		current,
    		compiled,
    		$codeStore,
    		$tabsStore,
    		deleteComponent,
    		newComponent,
    		select_handler,
    		del_handler,
    		input_components_binding,
    		input_current_binding
    	];
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
