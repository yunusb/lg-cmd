package expo.modules.lginfrared

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Local LG webOS SSAP WebSockets.
 *
 * React Native's standard Android WebSocket client injects an Origin header.
 * Certain LG TVs close the socket with 1008 ("invalid origin"). An OkHttp
 * Request without Origin is intentional and matches the SSAP clients that
 * successfully pair with these models. This is NOT a TLS bypass.
 *
 * Connection targets are strictly local IPv4 on ws://:3000. The module cannot
 * connect to public hosts, names, HTTPS or a different port.
 */
class LgWebSocketModule : Module() {
  private val connections = ConcurrentHashMap<Int, WebSocket>()
  private val client: OkHttpClient by lazy {
    appContext.okHttpClient.newBuilder()
      .connectTimeout(8, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .pingInterval(25, TimeUnit.SECONDS)
      .build()
  }

  override fun definition() = ModuleDefinition {
    Name("LgWebSocket")
    Events("onSocketEvent")

    Function("open") { id: Int, address: String ->
      require(id > 0) { "Identifiant de connexion invalide" }
      require(isAllowed(address)) { "Seul le port 3000 d'une TV sur le réseau local est autorisé" }
      require(!connections.containsKey(id)) { "Identifiant de connexion déjà utilisé" }
      val request = Request.Builder().url(address).build() // Never add Origin.
      val ws = client.newWebSocket(request, object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          if (connections[id] === webSocket) {
            sendEvent("onSocketEvent", mapOf("id" to id, "type" to "open"))
          } else {
            webSocket.cancel()
          }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
          if (connections[id] !== webSocket) return
          if (text.length > 65_536) {
            webSocket.close(1009, null)
            return
          }
          sendEvent("onSocketEvent", mapOf("id" to id, "type" to "message", "data" to text))
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          try { webSocket.close(code, null) } catch (_: Exception) { webSocket.cancel() }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          if (connections.remove(id, webSocket)) {
            sendEvent("onSocketEvent", mapOf(
              "id" to id, "type" to "close", "code" to code,
              "reason" to (if (reason.contains("invalid origin", ignoreCase = true)) "INVALID_ORIGIN" else "")
            ))
          }
        }

        override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) {
          if (connections.remove(id, webSocket)) {
            // Never forward exception, URL, headers, credentials or client-key to JS.
            sendEvent("onSocketEvent", mapOf("id" to id, "type" to "error"))
            sendEvent("onSocketEvent", mapOf("id" to id, "type" to "close", "code" to 1006))
          }
        }
      })
      val previous = connections.putIfAbsent(id, ws)
      if (previous != null) {
        ws.cancel()
        throw IllegalArgumentException("Identifiant de connexion déjà utilisé")
      }
    }

    Function("send") { id: Int, frame: String ->
      if (frame.length > 65_536) false
      else connections[id]?.send(frame) == true
    }

    Function("close") { id: Int ->
      connections.remove(id)?.cancel()
    }

    OnDestroy {
      connections.values.forEach { it.cancel() }
      connections.clear()
    }
  }

  private fun isAllowed(address: String): Boolean {
    if (address.length > 2_048 || address.any { it.isWhitespace() || it == '\\' || it == '#' }) return false
    val uri = try { URI(address) } catch (_: Exception) { return false }
    if (uri.scheme != "ws" || uri.port != 3000 || uri.userInfo != null || uri.fragment != null) return false
    val host = uri.host ?: return false
    val segments = host.split('.')
    if (segments.size != 4 || segments.any {
        it.isEmpty() || it.length > 3 || (it.length > 1 && it.startsWith('0')) ||
          it.any { ch -> ch !in '0'..'9' }
      }) return false
    val n = segments.map { it.toIntOrNull() ?: return false }
    if (n.any { it !in 0..255 }) return false
    return n[0] == 10 || (n[0] == 172 && n[1] in 16..31) ||
      (n[0] == 192 && n[1] == 168) || (n[0] == 169 && n[1] == 254)
  }
}
