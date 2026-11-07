package expo.modules.lginfrared

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger

/**
 * Discover LG remote services with bounded SSDP/M-SEARCH on the current Wi-Fi.
 * A remembered SSDP UUID enables early return for faster day-to-day reconnection.
 * Does not perform a subnet scan, background discovery, DNS or fetch LOCATION URLs.
 */
class LgDiscoveryModule : Module() {
  private val generation = AtomicInteger(0)
  @Volatile private var activeSocket: DatagramSocket? = null

  private fun cancel() {
    generation.incrementAndGet()
    activeSocket?.close()
    activeSocket = null
  }

  override fun definition() = ModuleDefinition {
    Name("LgDiscovery")
    Function("cancel") { cancel() }
    Function("openWifiSettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android indisponible")
      context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("discover") { preferredId: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android indisponible")
      scan(context, preferredId)
    }
    OnDestroy { cancel() }
  }

  private fun scan(context: Context, preferredId: String): List<Map<String, String>> {
    cancel()
    val scanId = generation.get()
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.allNetworks.firstOrNull {
      cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    } ?: throw IllegalStateException("Connectez le téléphone au Wi-Fi de la maison.")

    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val lock = wifi.createMulticastLock("lg-cmd-discovery").apply { setReferenceCounted(false) }
    val socket = DatagramSocket(null)
    val found = linkedMapOf<String, Map<String, String>>()
    val webos = "urn:lge-com:service:webos-second-screen:1"
    val netcast = "urn:lge-com:service:netrcu:1"
    val services = listOf(webos, netcast)
    val wanted = preferredId.trim().lowercase(Locale.ROOT).substringBefore("::")
    try {
      socket.reuseAddress = true
      socket.bind(InetSocketAddress(0))
      network.bindSocket(socket) // Use Wi-Fi even if Android defaults to mobile data.
      socket.soTimeout = 250
      activeSocket = socket
      if (generation.get() != scanId) return emptyList()
      lock.acquire()
      fun search() {
        for (service in services) {
          val message = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: $service\r\n\r\n"
          val bytes = message.toByteArray(Charsets.US_ASCII)
          socket.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName("239.255.255.250"), 1900))
        }
      }
      val began = SystemClock.elapsedRealtime()
      var lastResultAt = 0L
      var repeated = false
      search()
      while (generation.get() == scanId) {
        val elapsed = SystemClock.elapsedRealtime() - began
        if (elapsed >= 6200L) break
        // Once devices have answered, wait a little for siblings rather than showing
        // a spinner for the whole discovery window.
        if (found.isNotEmpty() && elapsed >= 1600L && SystemClock.elapsedRealtime() - lastResultAt >= 1000L) break
        if (!repeated && elapsed >= 2800L) { search(); repeated = true }
        val packet = DatagramPacket(ByteArray(4096), 4096)
        try { socket.receive(packet) } catch (_: SocketTimeoutException) { continue }
        val address = packet.address
        if (!address.isSiteLocalAddress && !address.isLinkLocalAddress) continue
        val host = address.hostAddress ?: continue
        if (host.contains(':')) continue // IPv6 needs separate URL and discovery handling.
        val response = String(packet.data, 0, packet.length, Charsets.UTF_8)
        if (!response.startsWith("HTTP/1.1 200", ignoreCase = true)) continue
        val headers = response.lineSequence().mapNotNull { line ->
          val separator = line.indexOf(':')
          if (separator <= 0) null else line.substring(0, separator).trim().lowercase(Locale.ROOT) to line.substring(separator + 1).trim()
        }.toMap()
        val service = headers["st"] ?: continue
        if (services.none { it.equals(service, ignoreCase = true) }) continue
        val usn = (headers["usn"] ?: host).take(200)
        found[host + service] = mapOf("host" to host, "service" to service, "id" to usn)
        lastResultAt = SystemClock.elapsedRealtime()
        // Fast path: find the *same* remembered TV, not just any first TV.
        if (service.equals(webos, ignoreCase = true) && wanted.startsWith("uuid:") &&
            usn.lowercase(Locale.ROOT).substringBefore("::") == wanted) break
        if (found.size >= 40) break
      }
    } catch (error: Exception) {
      if (generation.get() == scanId) throw error
    } finally {
      socket.close()
      if (activeSocket === socket) activeSocket = null
      if (lock.isHeld) lock.release()
    }
    return if (generation.get() == scanId) found.values.toList() else emptyList()
  }
}
