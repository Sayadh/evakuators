/**
 * Constants for the smoothed rating used to order the public listing.
 *
 * ## Why the listing is not ordered by the raw average
 *
 * A raw average treats one review as strongly as fifty. A driver with a single
 * 5.0 from one customer would outrank a driver with a 4.6 earned from twenty —
 * and the first tells you almost nothing, while the second is real evidence.
 *
 * So the score blends a driver's own average with a prior: an assumption about
 * what a typical driver is worth, which counts as a fixed number of imaginary
 * reviews. The more real reviews a driver has, the less the assumption matters;
 * past ~20 reviews it is effectively gone. See `getRecommendedScore()` in
 * `utils/towTruckFilters.ts` for the formula.
 *
 * This score is used ONLY for ordering. It is never displayed — what a visitor
 * would see, if the cards ever show a rating, is the real average and the real
 * count.
 */

/**
 * The rating an unrated driver is assumed to have — "an average driver on this
 * platform", which is where a newly approved profile starts in the ordering.
 *
 * Not 2.5 (the midpoint of the 1-5 scale): real review distributions are
 * heavily skewed high, because satisfied and angry customers write reviews and
 * indifferent ones don't. Service marketplaces typically land around 4.3-4.7.
 * A midpoint prior would bury every new driver below every rated one, which is
 * self-defeating — nobody calls them, so nobody ever reviews them.
 *
 * 4.3 is an ESTIMATE, chosen before this platform had any reviews of its own.
 * Once there are ~100 approved reviews, replace it with the measured value:
 *
 *   SELECT ROUND(AVG(rating)::numeric, 2) FROM "Review" WHERE "isApproved" = true;
 */
export const RATING_PRIOR = 4.3

/**
 * How many imaginary reviews the prior is worth — i.e. how much real evidence
 * it takes to overcome the assumption.
 *
 * At 3: one real review moves a driver a quarter of the way from the prior to
 * their own average, three reviews move them halfway, and twenty leave the
 * prior with under 15% of the weight. Raise it to trust small samples less,
 * lower it to react faster to the first few reviews.
 */
export const RATING_PRIOR_WEIGHT = 3
