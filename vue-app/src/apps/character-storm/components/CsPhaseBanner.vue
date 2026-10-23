<template>
    <Transition name="cs-banner">
        <div v-if="flash.show" class="cs-banner" :class="`cs-banner--${flash.variant}`" aria-live="assertive">
            <div class="cs-banner__stripe">
                <p class="cs-banner__kicker" aria-hidden="true">{{ flash.kicker }}</p>
                <p class="cs-banner__title">{{ flash.title }}</p>
                <p class="cs-banner__desc">{{ flash.desc }}</p>
            </div>
        </div>
    </Transition>
</template>

<script setup>
defineProps({
    flash: { type: Object, required: true },
})
</script>
