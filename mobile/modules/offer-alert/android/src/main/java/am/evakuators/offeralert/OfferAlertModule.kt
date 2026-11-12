package am.evakuators.offeralert

import android.content.Context
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge of the offer alarm (mobile/src/push/offerAlarm.ts). Android only;
 * the JS side falls back gracefully where the module is missing (iOS, or an
 * old development build).
 */
class OfferAlertModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("EvkOfferAlert")

    Events("onAction")

    OnCreate {
      OfferAlarm.onAction = { event -> sendEvent("onAction", mapOf("offerId" to event.offerId, "action" to event.action)) }
    }

    OnDestroy {
      OfferAlarm.onAction = null
    }

    AsyncFunction("show") { offerId: String, title: String, body: String, acceptLabel: String, rejectLabel: String, channelName: String, timeoutMs: Double ->
      OfferAlarm.show(context, offerId, title, body, acceptLabel, rejectLabel, channelName, timeoutMs.toLong())
    }

    AsyncFunction("mute") {
      OfferAlarm.mute(context)
    }

    AsyncFunction("stop") {
      OfferAlarm.stop(context)
    }

    Function("activeOfferId") {
      OfferAlarm.activeOfferId(context)
    }

    Function("consumeAction") {
      OfferAlarm.consume()?.let { mapOf("offerId" to it.offerId, "action" to it.action) }
    }

    AsyncFunction("status") { channelName: String ->
      OfferAlarm.ensureChannel(context, channelName)
      OfferAlarm.status(context)
    }

    Function("openSettings") { which: String ->
      OfferAlarm.openSettings(context, which)
    }

    Function("raiseAlarmVolume") {
      OfferAlarm.raiseAlarmVolume(context)
    }

    Function("setSound") { name: String ->
      OfferAlarm.setSound(context, name)
    }

    Function("sound") {
      OfferAlarm.sound(context)
    }

    Function("preview") { name: String ->
      OfferAlarm.preview(context, name)
    }

    Function("stopPreview") {
      OfferAlarm.stopPreview()
    }

    // The status bar and the phone's own navigation bar / gesture strip, in dp
    // (2026-11: with edge-to-edge the app draws under them — on a Xiaomi with
    // the three buttons the tab bar sat under them). Null until the window is laid out.
    Function("systemInsets") {
      val activity = appContext.currentActivity ?: return@Function null
      val insets = ViewCompat.getRootWindowInsets(activity.window.decorView) ?: return@Function null
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = activity.resources.displayMetrics.density.toDouble()
      mapOf("top" to bars.top / density, "bottom" to bars.bottom / density, "left" to bars.left / density, "right" to bars.right / density)
    }

    AsyncFunction("test") { delayMs: Double, title: String, body: String, acceptLabel: String, rejectLabel: String, channelName: String ->
      OfferAlarm.test(context, delayMs.toLong(), title, body, acceptLabel, rejectLabel, channelName)
    }
  }
}
