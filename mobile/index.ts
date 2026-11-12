// The background location task and the FCM background handler must be
// registered at module load, BEFORE the root component — when the OS wakes
// the app for a location update or a push there is no UI to mount first.
import './src/location/tracking'
import './src/push/push'
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
