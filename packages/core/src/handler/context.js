import extend from '@form-create/utils/lib/extend';
import toCase from '@form-create/utils/lib/tocase';
import BaseParser from '../factory/parser';
import {$del, $set} from '@form-create/utils/lib';
import is from '@form-create/utils/lib/type';
import {invoke} from '../frame/util';
import {toRef, watch} from 'vue';
import {attrs} from '../frame/attrs';


export default function useContext(Handler) {
    extend(Handler.prototype, {
        getCtx(id) {
            return this.fieldCtx[id] || this.nameCtx[id] || this.ctxs[id];
        },
        setCtx(ctx) {
            let {id, field, name, rule} = ctx;
            this.ctxs[id] = ctx;
            if (name) $set(this.nameCtx, name, ctx);
            if (!ctx.input) return;
            this.fieldCtx[field] = ctx;
            this.setFormData(ctx, ctx.parser.toFormValue(rule.value, ctx));
            if (this.isMounted && !this.reloading) {
                this.vm.$emit('change', ctx.field, rule.value, ctx.origin, this.api);
            }
        },
        getParser(ctx) {
            const list = this.fc.parsers;
            return list[ctx.originType] || list[toCase(ctx.type)] || list[ctx.trueType] || BaseParser;
        },
        bindParser(ctx) {
            ctx.setParser(this.getParser(ctx));
        },
        getType(alias) {
            const map = this.fc.CreateNode.aliasMap;
            const type = map[alias] || map[toCase(alias)] || alias;
            return toCase(type);
        },
        noWatch(fn) {
            if (!this.noWatchFn) {
                this.noWatchFn = fn;
            }
            invoke(fn);
            if (this.noWatchFn === fn) {
                this.noWatchFn = null;
            }
        },
        watchCtx(ctx) {
            const none = ['field', 'value', 'vm', 'template', 'name', 'config', 'control', 'inject', 'sync', 'payload', 'optionsTo', 'update'];
            const all = attrs();
            all.filter(k => none.indexOf(k) === -1).forEach((key) => {
                const ref = toRef(ctx.rule, key);
                const flag = key === 'children';
                ctx.refRule[key] = ref;
                ctx.watch.push(watch(flag ? () => [...(ref.value || [])] : ref, (_, o) => {
                    const n = ref.value;
                    if (this.isBreakWatch()) return;
                    if (flag && ctx.parser.loadChildren === false) return;
                    this.watching = true;
                    if (key === 'link') {
                        ctx.link();
                        return;
                    } else if (['props', 'on'].indexOf(key) > -1) {
                        this.parseInjectEvent(ctx.rule, n || {});
                        if (key === 'props' && ctx.input) {
                            this.setFormData(ctx, ctx.parser.toFormValue(ctx.rule.value, ctx));
                        }
                    } else if (key === 'emit')
                        this.parseEmit(ctx);
                    else if (['prefix', 'suffix'].indexOf(key) > -1)
                        n && this.loadFn(n, ctx.rule);
                    else if (key === 'type') {
                        ctx.updateType();
                        this.bindParser(ctx);
                    } else if (key === 'children') {
                        this.deferSyncValue(() => {
                            o && o.forEach((child) => {
                                if ((n || []).indexOf(child) === -1 && child && !is.String(child) && child.__fc__ && !this.ctxs[child.__fc__.id]) {
                                    this.rmCtx(child.__fc__);
                                }
                            });
                            is.trueArray(n) && this.loadChildren(n, ctx);
                        });
                    }
                    this.$render.clearCache(ctx);
                    this.watching = false;
                }, {deep: !flag, sync: flag}));
            });
            if (ctx.input) {
                const val = toRef(ctx.rule, 'value');
                ctx.watch.push(watch(val, () => {
                    const formValue = ctx.parser.toFormValue(val.value, ctx);
                    if (this.isChange(ctx, formValue)) {
                        this.setValue(ctx, val.value, formValue, true);
                    }
                }));
            }
            this.watchEffect(ctx);
        },
        rmSub(sub) {
            is.trueArray(sub) && sub.forEach(r => {
                r && r.__fc__ && this.rmCtx(r.__fc__);
            })
        },
        rmCtx(ctx) {
            // console.trace(ctx.field,'deleted');
            if (ctx.deleted) return;
            const {id, field, name} = ctx;
            if (ctx.input) {
                Object.defineProperty(ctx.rule, 'value', {
                    value: ctx.rule.value,
                    writable: true
                });
            }

            $del(this.ctxs, id);

            const f = this.fieldCtx[field];
            let flag = false;

            if (field && (!f || f === ctx)) {
                $del(this.formData, field);
                $del(this.form, field);
                $del(this.fieldCtx, field);
                $del(this.subForm, field);
                flag = true;
            }
            if (name && this.nameCtx[name] === ctx) {
                $del(this.nameCtx, name);
            }
            if (!this.reloading) {
                if (ctx.parser.loadChildren !== false) {
                    this.deferSyncValue(() => {
                        if (is.trueArray(ctx.rule.children)) {
                            ctx.rule.children.forEach(h => h.__fc__ && this.rmCtx(h.__fc__));
                        }
                        this.syncValue();
                    })
                }
                if (ctx.root === this.rules) {
                    this.vm.renderRule();
                }
            }

            const index = this.sort.indexOf(id);
            if (index > -1) {
                this.sort.splice(index, 1);
            }

            this.$render.clearCache(ctx);
            ctx.delete();
            this.effect(ctx, 'deleted');
            flag && this.vm.$emit('remove-field', field, ctx.rule, this.api);
            ctx.rule.__ctrl || this.vm.$emit('remove-rule', ctx.rule, this.api);
            return ctx;
        },
    })
}
