<script setup lang="ts">
import { capacityDisplayText, vehicleTypeShortLabel } from '~/constants/vehicles'
import type { DispatchCandidateBasic, DispatchCandidateByDistance } from '~/types/dispatch'
import { formatDistanceLine } from '~/utils/formatDistance'
import { getPhoneHref } from '~/utils/formatPhone'
import { getTowTruckRoute } from '~/utils/routeHelpers'

/**
 * One driver on the dispatcher's screen.
 *
 * Extracted because the screen has three searches and had three copies of this
 * markup, which is three places to add a field and two places to forget it —
 * which is exactly what happened: capacity, vehicle type, wheel skates and the
 * call figure reached the place search and nowhere else, and the dispatcher
 * saw a different driver depending on how they had looked them up. The facts
 * on a card are a property of the driver, not of how they were found.
 *
 * What legitimately differs between the three is carried as props rather than
 * as separate templates:
 *
 * - `distanceMeters` exists only on the coordinate search, and is read off the
 *   candidate rather than passed, because it IS part of that answer.
 * - `canRefer` is false on the driver search. A referral is stored against a
 *   place (`locationSlug`, `locationName`, `locationType` are all required by
 *   the endpoint) and a name typed into a box is not one; a placeholder
 *   location would put rows in the referral log that no report can read.
 */
interface Props {
  candidate: DispatchCandidateBasic | DispatchCandidateByDistance
  /** Already marked as having taken a job, in THIS search */
  referred?: boolean
  /** A referral for this driver is in flight */
  referring?: boolean
  /** Whether «Ուղղորդված է» is offered at all — see the note above */
  canRefer?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  referred: false,
  referring: false,
  canRefer: true,
})

defineEmits<{ refer: [] }>()

/** Present only on the coordinate search's answer */
const distanceMeters = computed(() =>
  'distanceMeters' in props.candidate ? props.candidate.distanceMeters : null,
)

/**
 * «3 օր առաջ», «դեռ չի ստացել».
 *
 * Lives here rather than on the page for the same reason the markup does: it
 * is part of what a card says, and a second copy would be a second wording.
 */
const lastDispatchedLabel = computed(() => {
  const iso = props.candidate.lastDispatchedAt
  if (iso === undefined) return 'դեռ չի ստացել'

  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'վերջինը՝ այսօր'
  if (days === 1) return 'վերջինը՝ երեկ'
  return `վերջինը՝ ${days} օր առաջ`
})
</script>

<template>
  <article class="candidate" :class="{ 'candidate--referred': referred }">
    <div class="candidate__who">
      <!-- A link, and a new tab on purpose: this screen is read with somebody
           on the phone, and navigating away would throw away the search that
           produced the list. -->
      <NuxtLink :to="getTowTruckRoute(candidate.slug)" target="_blank" class="candidate__name">
        {{ candidate.driverName }}
        <span v-if="candidate.isFeatured" title="Լավագույններից">★</span>
        <AppBadge v-if="candidate.isPartner" variant="primary">Մեր վարորդ</AppBadge>
      </NuxtLink>

      <!-- Make, then type, then tonnage. «Mercedes Sprinter» says who built it;
           «Սահող հարթակով» says what it can do, which is the half the
           customer's problem is phrased in; the tonnage answers whether the car
           fits. Capacity goes through the same `capacityDisplayText` the public
           profile uses, so a dispatcher and a customer read one figure rather
           than two spellings of it. -->
      <span class="candidate__muted">
        {{ candidate.vehicle }} · {{ vehicleTypeShortLabel(candidate.vehicleType) }} ·
        {{ capacityDisplayText(candidate.capacityTons) }}
      </span>

      <!-- Only when true. Several vehicle types are never asked (see
           `asksWheelSkates`), so «Ռոլիկներ՝ ոչ» would answer a question nobody
           put to that driver. -->
      <span v-if="candidate.wheelSkates" class="candidate__skates">
        <AppIcon name="check" :size="13" /> Անիվային ռոլիկներ
      </span>
    </div>

    <p class="candidate__meta">
      <span v-if="distanceMeters !== null">{{ formatDistanceLine(distanceMeters, false) }}</span>
      <span v-if="candidate.rating">⭐ {{ candidate.rating }}</span>
      <!-- Demand beside supply: how often customers rang this driver over the
           last 30 days, next to how often we handed them a job this month. The
           first is the market's answer, the second is ours. -->
      <span>{{ candidate.callsRecent }} զանգ · 30 օր</span>
      <span>{{ candidate.dispatchesThisMonth }} այս ամիս</span>
      <span>{{ lastDispatchedLabel }}</span>
    </p>

    <p class="candidate__base">
      <AppIcon name="map" :size="14" />
      Հիմնական գտնվելու վայրը՝ {{ candidate.baseName }}
    </p>

    <!-- Both warnings are about the driver rather than the search, so they
         belong to the card: a deactivated profile can only come back from the
         driver search, and a lapsed subscription from any of the three. -->
    <p v-if="!candidate.isActive" class="candidate__warn">էջը ապաակտիվացված է</p>
    <p v-if="candidate.subscriptionStatus === 'overdue'" class="candidate__warn">
      բաժանորդագրությունը սպառվել է
    </p>

    <div class="candidate__actions">
      <a :href="getPhoneHref(candidate.phone)" class="candidate__call">
        Զանգել · {{ candidate.phone }}
      </a>
      <AppButton
        v-if="canRefer"
        size="sm"
        :variant="referred ? 'success' : 'outline'"
        :disabled="referring || referred"
        @click="$emit('refer')"
      >
        {{ referred ? 'Ուղղորդված է ✓' : 'Ուղղորդված է' }}
      </AppButton>
    </div>
  </article>
</template>

<style scoped lang="scss">
.candidate {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  margin-bottom: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  &--referred {
    border-color: var(--color-success, #2f855a);
    background: rgba(47, 133, 90, 0.06);
  }

  &__who {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__name {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--color-text);

    // Underlined on hover only: a dozen underlined names reads as a wall of
    // links, and this is a name first and a link second.
    &:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
  }

  &__muted {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  /* An accent chip rather than another muted line: it is the one capability on
     this card that decides whether a driver can take THIS car at all. */
  &__skates {
    display: inline-flex;
    align-items: center;
    /* `__who` is a stretching column, so without this the chip spans the card
       and stops reading as a chip. */
    align-self: flex-start;
    gap: 4px;
    margin-top: var(--space-1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: rgba(20, 48, 79, 0.08);
    color: var(--color-primary);
    font-size: 0.78rem;
    font-weight: 600;
  }

  &__meta {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: 0.9rem;
  }

  &__base {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.9rem;
    color: var(--color-text-secondary);

    svg {
      flex-shrink: 0;
      color: var(--color-text-muted);
    }
  }

  &__warn {
    margin: 0;
    color: var(--color-danger, #c53030);
    font-size: 0.9rem;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  /* The primary action on the screen, sized like it. */
  &__call {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: #fff;
    text-align: center;
    font-weight: 600;
    text-decoration: none;
  }
}
</style>
