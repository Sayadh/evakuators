/**
 * Mock API client.
 *
 * When the backend is ready, replace `mockRequest` calls inside the services
 * with real `$fetch` requests — component and composable code stays unchanged.
 */
const MOCK_DELAY_MS = 150

export async function mockRequest<T>(resolve: () => T): Promise<T> {
  await new Promise((r) => setTimeout(r, MOCK_DELAY_MS))
  return resolve()
}
