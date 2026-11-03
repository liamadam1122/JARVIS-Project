import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var server: Process?
    let page = URL(string: "http://127.0.0.1:4173")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let webView = WKWebView(frame: .zero)
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "JARVIS"
        window.minSize = NSSize(width: 860, height: 620)
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        probe {
            if $0 {
                webView.load(URLRequest(url: self.page))
            } else if self.startServer() {
                self.waitForServer(webView, tries: 20)
            } else {
                webView.loadHTMLString(Self.offlinePage, baseURL: nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminate()
    }

    func probe(_ done: @escaping (Bool) -> Void) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 0.6
        URLSession(configuration: config).dataTask(with: page) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { done(ok) }
        }.resume()
    }

    func startServer() -> Bool {
        let fileManager = FileManager.default
        guard let exe = Bundle.main.executableURL else { return false }
        let serverFile = exe
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("server.mjs")
        guard fileManager.fileExists(atPath: serverFile.path) else { return false }
        let node = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].first { fileManager.isExecutableFile(atPath: $0) }
        guard let node else { return false }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: node)
        proc.arguments = [serverFile.path]
        proc.currentDirectoryURL = serverFile.deletingLastPathComponent()
        do {
            try proc.run()
            server = proc
            return true
        } catch {
            return false
        }
    }

    func waitForServer(_ webView: WKWebView, tries: Int) {
        probe { up in
            if up {
                webView.load(URLRequest(url: self.page))
            } else if tries > 0 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    self.waitForServer(webView, tries: tries - 1)
                }
            } else {
                webView.loadHTMLString(Self.offlinePage, baseURL: nil)
            }
        }
    }

    static let offlinePage = """
    <html><body style="font-family:-apple-system,sans-serif;background:#10140f;color:#e7eee4;padding:48px">
    <h1 style="font-weight:500">JARVIS needs the local server</h1>
    <p>This window only shows readings. It does not tune a Mac, and it is not an App Store build.</p>
    <p>Install Node.js 20, then double-click start-mac.command in the jarvis folder.</p>
    </body></html>
    """
}

@main
struct JarvisMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.setActivationPolicy(.regular)
        app.delegate = delegate
        app.run()
    }
}
