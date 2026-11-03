package expo.modules.lginfrared

import android.content.Context
import android.hardware.ConsumerIrManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** IR emitter backed by Android ConsumerIrManager. */
class LgInfraredModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LgInfrared")

    Function("isAvailable") {
      val context = appContext.reactContext
      val manager = context?.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager
      manager?.hasIrEmitter() == true
    }

    AsyncFunction("send") { code: Int ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("Contexte Android indisponible")
      val manager = context.getSystemService(Context.CONSUMER_IR_SERVICE) as? ConsumerIrManager
      if (manager?.hasIrEmitter() != true) {
        throw IllegalStateException("Ce téléphone n'a pas d'émetteur infrarouge")
      }
      manager.transmit(38_000, necPattern(code))
      true
    }
  }

  /** LG NEC 38 kHz, 32 bits MSB first. */
  private fun necPattern(code: Int): IntArray {
    val result = IntArray(67)
    result[0] = 9000
    result[1] = 4500
    for (i in 0 until 32) {
      val bit = (code ushr (31 - i)) and 1
      result[2 + i * 2] = 560
      result[3 + i * 2] = if (bit == 1) 1690 else 560
    }
    result[66] = 560
    return result
  }
}
