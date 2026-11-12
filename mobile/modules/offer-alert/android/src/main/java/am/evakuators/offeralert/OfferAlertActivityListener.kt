package am.evakuators.offeralert

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/** Sees the intents the alarm opens the app with — on a cold start and when already running */
class OfferAlertActivityListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    OfferAlarm.attach(activity)
    OfferAlarm.handleIntent(activity, activity.intent)
  }

  override fun onResume(activity: Activity) {
    OfferAlarm.attach(activity)
  }

  override fun onNewIntent(intent: Intent): Boolean {
    OfferAlarm.handleIntent(null, intent)
    return false
  }
}
