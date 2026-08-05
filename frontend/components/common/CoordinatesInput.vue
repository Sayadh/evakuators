<script setup lang="ts">
/**
 * The base parking coordinates block: the explanation, the Google Maps link,
 * one text field, and the error under it.
 *
 * ## Why this is a component and not markup in three pages
 *
 * The same block appears in the registration form, in the driver's dashboard
 * dialog and in the admin's dialog. What is being asked for is identical in all
 * three, so the wording, the placeholder and the accepted formats have to be
 * identical too — a driver told «թվերը բաժանեք ստորակետով կամ բացատով» on one
 * screen and something subtly different on another has been given two rules for
 * one field. Same argument as `ServiceAreaPicker` and
 * `PlatformDimensionsInput` being shared rather than copied (see CLAUDE.md
 * § "Manual sync points").
 *
 * ## One box, two numbers
 *
 * This is the only place in the system where a coordinate pair is a string, and
 * it is a string here for one reason: that is the shape Google Maps puts on a
 * driver's clipboard. `parseCoordinates` (utils/coordinates.ts) splits it
 * before anything is submitted — the API and the database only ever see two
 * numbers. See that file for the full reasoning.
 *
 * ## No embedded map, deliberately
 *
 * An interactive picker would need the Google Maps JavaScript API, which means
 * an API key, a billing account, a third-party script on the registration page
 * and a consent story for it. Copy-and-paste out of the app the driver already
 * has open costs none of that and is a step they can complete on a phone with
 * one hand.
 */
interface Props {
  modelValue: string
  /**
   * Heading above the block. The registration form needs one (it is a section
   * among many); a dialog does not (its own title already says what it is), so
   * it is omitted there rather than repeated.
   */
  heading?: string
  /**
   * The five numbered steps. Shown wherever a driver is meeting this field for
   * the first time — registration and their own dashboard. The admin panel
   * turns them off: an admin pasting a correction on someone's behalf does not
   * need to be taught how to use Google Maps, and the dialog stays short enough
   * to read at a glance.
   */
  showSteps?: boolean
  error?: string
}

withDefaults(defineProps<Props>(), {
  heading: undefined,
  showSteps: true,
  error: '',
})

defineEmits<{ 'update:modelValue': [value: string] }>()

/**
 * Plain `maps.google.com`, with no query and no API involved.
 *
 * On a phone this URL is claimed by the Google Maps app, so the driver lands
 * exactly where they need to be with the map they already know; on a desktop it
 * opens the web version. Both are the browser's own behaviour, which is why
 * there is nothing here to configure or to keep working.
 */
const GOOGLE_MAPS_URL = 'https://maps.google.com/'
</script>

<template>
  <div class="coordinates">
    <p v-if="heading" class="coordinates__heading">{{ heading }}</p>

    <p class="coordinates__intro">
      Կոորդինատներն անհրաժեշտ են, որպեսզի հաճախորդին ցույց տանք իրեն ամենամոտ գտնվող
      էվակուատորները։
    </p>

    <ol v-if="showSteps" class="coordinates__steps">
      <li>Բացեք Google Maps-ը։</li>
      <li>Գտեք Ձեր էվակուատորի հիմնական կայանման վայրը։</li>
      <li>Սեղմած պահեք քարտեզի համապատասխան կետի վրա։</li>
      <li>Պատճենեք ցուցադրված երկու թվերը։</li>
      <li>Տեղադրեք դրանք ներքևի դաշտում։</li>
    </ol>

    <!-- rel="noopener noreferrer" with target="_blank": noopener stops the
         opened page from reaching back through window.opener, noreferrer keeps
         our URL out of its referrer. Both, not one — older browsers imply
         noopener from noreferrer but not the reverse. -->
    <AppButton
      :href="GOOGLE_MAPS_URL"
      variant="outline"
      size="sm"
      target="_blank"
      rel="noopener noreferrer"
      class="coordinates__maps-link"
    >
      <AppIcon name="map-pin" :size="16" />
      Բացել Google Maps-ը
    </AppButton>

    <!-- Marked required everywhere this appears, because it is: registration
         will not submit without it, and neither dialog will save without it.
         (The registration <form> is `novalidate`, and the dialogs are not
         forms at all, so the attribute is purely the visual asterisk the rest
         of the registration form already uses for its required fields.) -->
    <AppInput
      :model-value="modelValue"
      label="Կոորդինատներ"
      placeholder="40.1792, 44.4991"
      required
      :error="error"
      @update:model-value="$emit('update:modelValue', $event)"
    />

    <!-- Under the field, not above it: this is what to do when the error
         appears, and the error appears here. -->
    <p class="coordinates__hint">
      Նախ գրեք լայնությունը, ապա՝ երկայնությունը։ Թվերը բաժանեք ստորակետով կամ բացատով։
    </p>
  </div>
</template>

<style scoped lang="scss">
.coordinates {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__heading {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  &__intro {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }

  &__steps {
    margin: 0;
    // The list marker sits outside the text column, so a step that wraps to a
    // second line stays aligned with the first rather than under its own number.
    padding-inline-start: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }

  &__maps-link {
    // Full width on a phone (it is a real tap target on the screen where this
    // matters most), shrunk to its content once there is room for the field
    // and the link to read as two separate things.
    align-self: stretch;

    @media (min-width: 640px) {
      align-self: flex-start;
    }
  }

  &__hint {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-text-muted);
  }
}
</style>
