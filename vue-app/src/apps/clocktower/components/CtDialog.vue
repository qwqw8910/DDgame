<template>
    <!-- 本 App 共用的對話框外框（Reka UI Dialog） -->
    <DialogRoot :open="open" @update:open="v => { if (!v && dismissable) $emit('close') }">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm" />
            <DialogContent :class="['fixed left-1/2 top-1/2 z-[91] flex max-h-[88dvh] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border-glow bg-card-solid shadow-2xl outline-none animate-pop-in', wide ? 'max-w-2xl' : 'max-w-md']"
                @escape-key-down="e => { if (!dismissable) e.preventDefault() }"
                @pointer-down-outside="e => { if (!dismissable) e.preventDefault() }">
                <div class="flex shrink-0 items-center justify-between gap-2 border-b border-divider px-4 py-3">
                    <DialogTitle class="m-0 text-lg font-bold text-heading">
                        <slot name="title">{{ title }}</slot>
                    </DialogTitle>
                    <DialogClose v-if="dismissable" class="header-icon-btn" aria-label="關閉" @click="$emit('close')">✕</DialogClose>
                </div>
                <DialogDescription class="sr-only">{{ title }}</DialogDescription>
                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <slot />
                </div>
                <div v-if="$slots.footer" class="shrink-0 border-t border-divider px-4 py-3">
                    <slot name="footer" />
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>

<script setup>
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'

defineProps({
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    wide: { type: Boolean, default: false },
    dismissable: { type: Boolean, default: true },
})
defineEmits(['close'])
</script>
