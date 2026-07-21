<template>
  <section class="hero">
    <div class="container">
      <div class="hero__content">
        <h1 class="hero__title">Գտեք մոտակա էվակուատորը Հայաստանում</h1>
        <p class="hero__subtitle">
          Ընտրեք մարզը կամ քաղաքը, տեսեք հասանելի մեքենաները և անմիջապես զանգահարեք վարորդին։
        </p>
      </div>
      <LocationSearch class="hero__search" />
      <ul class="hero__points">
        <li><AppIcon name="check" :size="16" /> Ամբողջ Հայաստանում</li>
        <li><AppIcon name="clock" :size="16" /> 24/7 ծառայություններ</li>
        <li><AppIcon name="phone" :size="16" /> Ուղիղ կապ վարորդի հետ</li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
.hero {
  background: linear-gradient(160deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, var(--color-primary-light) 100%);
  padding: var(--space-7) 0;
  color: #fff;

  @media (min-width: 768px) {
    padding: var(--space-8) 0;
  }

  &__content {
    max-width: 640px;
    margin: 0 auto var(--space-5);
    text-align: center;
  }

  &__title {
    color: #fff;
    margin-bottom: var(--space-3);
  }

  &__subtitle {
    font-size: 1.05rem;
    color: rgba(255, 255, 255, 0.85);
    margin: 0;
  }

  &__search {
    max-width: 860px;
    margin: 0 auto;
  }

  &__points {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3) var(--space-5);
    margin-top: var(--space-5);

    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.92rem;
      color: rgba(255, 255, 255, 0.85);

      svg {
        color: var(--color-accent);
      }
    }
  }
}
</style>
