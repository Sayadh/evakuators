<script setup lang="ts">
import { reviewsService } from '~/services'
import { extractErrorMessage } from '~/utils/errors'

interface Props {
  towTruckId: number
}

const props = defineProps<Props>()

const authorName = ref('')
const rating = ref(0)
const text = ref('')
const cityName = ref('')
const submitting = ref(false)
const error = ref('')
const success = ref(false)

function reset(): void {
  authorName.value = ''
  rating.value = 0
  text.value = ''
  cityName.value = ''
}

async function submit(): Promise<void> {
  error.value = ''

  if (!authorName.value.trim()) {
    error.value = 'Գրեք Ձեր անունը'
    return
  }
  if (rating.value < 1) {
    error.value = 'Ընտրեք գնահատական (1-5 աստղ)'
    return
  }
  if (text.value.trim().length < 5) {
    error.value = 'Կարծիքի տեքստը շատ կարճ է'
    return
  }

  submitting.value = true
  try {
    await reviewsService.create(props.towTruckId, {
      authorName: authorName.value.trim(),
      rating: rating.value,
      text: text.value.trim(),
      cityName: cityName.value.trim() || undefined,
    })
    reset()
    success.value = true
  } catch (err) {
    error.value = extractErrorMessage(err, 'Կարծիքն ուղարկել չհաջողվեց, փորձեք կրկին։')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="review-form" aria-labelledby="review-form-title">
    <h2 id="review-form-title">Թողնել կարծիք</h2>

    <p v-if="success" class="review-form__success">
      Շնորհակալություն։ Ձեր կարծիքը կուղարկվի մոդերացիայի և կերևա էջում հաստատումից հետո։
    </p>

    <form v-else class="review-form__form" @submit.prevent="submit">
      <div class="review-form__field">
        <span class="review-form__label">Գնահատական</span>
        <div class="review-form__stars">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="review-form__star-btn"
            :aria-label="`${n} աստղ 5-ից`"
            :aria-pressed="n <= rating"
            @click="rating = n"
          >
            <AppIcon :name="n <= rating ? 'star-filled' : 'star'" :size="26" />
          </button>
        </div>
      </div>

      <AppInput v-model="authorName" label="Ձեր անունը" placeholder="Օր.՝ Արամ Ա." required />
      <AppInput v-model="cityName" label="Քաղաք (ոչ պարտադիր)" placeholder="Օր.՝ Երևան" />

      <div class="review-form__field">
        <label class="review-form__label" for="review-text">Ձեր կարծիքը</label>
        <textarea
          id="review-text"
          v-model="text"
          class="review-form__textarea"
          rows="4"
          placeholder="Պատմեք, թե ինչպես անցավ ծառայությունը..."
        />
      </div>

      <p v-if="error" class="review-form__error" role="alert">{{ error }}</p>

      <AppButton type="submit" variant="success" :disabled="submitting">
        {{ submitting ? 'Ուղարկվում է…' : 'Ուղարկել կարծիքը' }}
      </AppButton>
    </form>
  </section>
</template>

<style scoped lang="scss">
.review-form {
  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__stars {
    display: flex;
    gap: var(--space-1);
  }

  &__star-btn {
    display: inline-flex;
    padding: 2px;
    color: var(--color-accent);
    background: none;
    border: none;
    cursor: pointer;

    &:hover {
      opacity: 0.75;
    }
  }

  &__textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    resize: vertical;
    transition: border-color var(--transition);

    &:hover,
    &:focus {
      border-color: var(--color-primary);
    }
  }

  &__error {
    color: var(--color-danger);
    margin: 0;
    font-size: 0.9rem;
  }

  &__success {
    color: var(--color-success);
    margin: 0;
  }
}
</style>
