import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var server: Process?
    let page = URL(string: "http://127.0.0.1:4173")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !Self.isInApplications(Bundle.main.bundlePath) {
            showMoveWindow()
            return
        }
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

    static func isInApplications(_ path: String) -> Bool {
        let homeApps = (NSHomeDirectory() as NSString).appendingPathComponent("Applications")
        return path.hasPrefix("/Applications/") || path.hasPrefix(homeApps + "/")
    }

    func showMoveWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 300),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "JARVIS"
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 560, height: 300))
        let title = NSTextField(labelWithString: "Drag JARVIS to Applications")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.frame = NSRect(x: 32, y: 210, width: 500, height: 32)
        let body = NSTextField(wrappingLabelWithString: "JARVIS stays closed until the app is in the Applications folder. Drag the JARVIS icon onto Applications, then open it from there.")
        body.frame = NSRect(x: 32, y: 120, width: 490, height: 72)
        let button = NSButton(title: "Show in Finder", target: self, action: #selector(revealInstall))
        button.bezelStyle = .rounded
        button.frame = NSRect(x: 32, y: 48, width: 160, height: 32)
        content.addSubview(title)
        content.addSubview(body)
        content.addSubview(button)
        window.contentView = content
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        revealInstall()
    }

    @objc func revealInstall() {
        NSWorkspace.shared.activateFileViewerSelecting([Bundle.main.bundleURL])
        NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications", isDirectory: true))
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
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("server/server.mjs")
        let besideApp = exe
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("server.mjs")
        let serverFile = [bundled, besideApp].compactMap { $0 }.first { fileManager.fileExists(atPath: $0.path) }
        guard let serverFile else { return false }
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
