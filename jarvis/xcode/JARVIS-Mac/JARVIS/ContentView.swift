import AppKit
import Darwin
import SwiftUI

// Paste this file into a macOS App target that uses SwiftUI.
// The window, the chat, and the Mac readings all live in this file.
// Archive from the included JARVIS.xcodeproj. This target is sandboxed and
// uses only public macOS calls, so it can be uploaded from Xcode.

struct ContentView: View {
    @StateObject private var machine = MachineModel()
    @State private var conversations: [Conversation] = ConversationStore.load()
    @State private var selectedID: UUID?
    @State private var draft = ""
    @State private var thinking = false
    @State private var status = "Thinking"

    private var selected: Conversation? {
        conversations.first { $0.id == selectedID }
    }

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            chat
        }
        .navigationSplitViewStyle(.balanced)
        .preferredColorScheme(.dark)
        .task {
            if conversations.isEmpty {
                let created = Conversation(title: "New conversation", messages: [])
                conversations = [created]
                selectedID = created.id
            } else if selectedID == nil {
                selectedID = conversations[0].id
            }
            await machine.watch()
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Mark(busy: thinking)
                VStack(alignment: .leading, spacing: 2) {
                    Text("JARVIS")
                        .font(.system(size: 13, weight: .semibold))
                        .tracking(3)
                    Text("This Mac")
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.muted)
                }
            }
            .padding(.horizontal, 8)

            Button(action: newConversation) {
                Text("New conversation")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(QuietButtonStyle())

            Text("CONVERSATIONS")
                .font(.system(size: 10, weight: .medium))
                .tracking(1.4)
                .foregroundStyle(Palette.muted)
                .padding(.horizontal, 10)

            ScrollView {
                VStack(spacing: 2) {
                    ForEach(conversations) { item in
                        HStack(spacing: 0) {
                            Button(item.title) { selectedID = item.id }
                                .buttonStyle(.plain)
                                .font(.system(size: 12))
                                .foregroundStyle(item.id == selectedID ? Palette.text : Palette.muted)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 8)
                                .padding(.horizontal, 10)
                                .background(item.id == selectedID ? Palette.cyan.opacity(0.08) : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            Button("Delete") { delete(item) }
                                .buttonStyle(.plain)
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.muted)
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                pulseRow("CPU", machine.cpuPercent)
                pulseRow("Memory", machine.memoryPercent)
                Text(machine.summary)
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 4)

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                Circle().fill(Palette.green).frame(width: 6, height: 6)
                Text("Readings stay on this Mac")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.muted)
            }
            .padding(13)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
        }
        .padding(18)
        .frame(minWidth: 220)
        .background(Palette.bg)
    }

    private var chat: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("THIS MAC")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(2)
                Text("Built to show CPU, memory, and heat on a Mac. A gaming PC still uses the GitHub download.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 28)
            .padding(.vertical, 18)
            .overlay(alignment: .bottom) { Rectangle().fill(Palette.line).frame(height: 1) }

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if selected?.messages.isEmpty != false {
                            welcome
                        }
                        ForEach(selected?.messages ?? []) { message in
                            Text(message.text)
                                .font(.system(size: 15))
                                .foregroundStyle(message.role == "user" ? Palette.text : Palette.text.opacity(0.92))
                                .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
                                .padding(14)
                                .background(message.role == "user" ? Palette.panel : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .id(message.id)
                        }
                        if thinking {
                            HStack(spacing: 10) {
                                Mark(busy: true).frame(width: 22, height: 22)
                                Text(status)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.muted)
                            }
                            .id("thinking")
                        }
                    }
                    .padding(28)
                    .frame(maxWidth: 760, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: selected?.messages.count ?? 0) { _, _ in
                    if let last = selected?.messages.last?.id {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Ask about this Mac / Pregunta por este Mac", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...4)
                    .padding(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Palette.line))
                Button("Send") { send() }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || thinking)
            }
            .padding(20)
            .background(Palette.bg)
        }
        .background(Palette.bg)
    }

    private var welcome: some View {
        VStack(spacing: 14) {
            Mark(busy: false).frame(width: 34, height: 34)
            Text("What should this Mac do?")
                .font(.system(size: 32, weight: .regular))
            Text("¿Qué debería hacer este Mac?")
                .font(.system(size: 15))
                .foregroundStyle(Palette.muted)
            Text(machine.summary)
                .font(.system(size: 15))
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
            VStack(spacing: 8) {
                suggestion("Optimize this Mac")
                suggestion("Why does it feel warm?")
                suggestion("What can you read on this Mac?")
                suggestion("Optimiza este Mac")
                suggestion("¿Por qué se calienta?")
            }
            .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28)
    }

    private func suggestion(_ title: String) -> some View {
        Button(title) {
            draft = title
            send()
        }
        .buttonStyle(QuietButtonStyle())
    }

    private func pulseRow(_ name: String, _ value: Double?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name).foregroundStyle(Palette.muted)
                Spacer()
                Text(value.map { "\(Int($0.rounded()))%" } ?? "Unavailable")
            }
            .font(.system(size: 11))
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.06))
                    Capsule().fill(Palette.cyan).frame(width: geo.size.width * CGFloat((value ?? 0) / 100))
                }
            }
            .frame(height: 2)
        }
    }

    private func newConversation() {
        let created = Conversation(title: "New conversation", messages: [])
        conversations.insert(created, at: 0)
        selectedID = created.id
        ConversationStore.save(conversations)
    }

    private func delete(_ item: Conversation) {
        conversations.removeAll { $0.id == item.id }
        if selectedID == item.id { selectedID = conversations.first?.id }
        if conversations.isEmpty { newConversation() }
        ConversationStore.save(conversations)
    }

    private func send() {
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !thinking else { return }
        guard let index = conversations.firstIndex(where: { $0.id == selectedID }) else { return }
        draft = ""
        if conversations[index].messages.isEmpty {
            conversations[index].title = String(question.prefix(42))
        }
        conversations[index].messages.append(ChatMessage(role: "user", text: question))
        thinking = true
        ConversationStore.save(conversations)
        let snapshot = machine.snapshot()
        Task {
            let phrases = ["Thinking", "Finishing up", "Giving the last touches", "Dotting the i's"]
            for phrase in phrases {
                status = phrase
                try? await Task.sleep(for: .milliseconds(450))
            }
            let reply = Advisor.reply(to: question, machine: snapshot)
            if let current = conversations.firstIndex(where: { $0.id == selectedID }) {
                conversations[current].messages.append(ChatMessage(role: "jarvis", text: reply))
                ConversationStore.save(conversations)
            }
            thinking = false
        }
    }
}

struct Mark: View {
    var busy: Bool

    var body: some View {
        TimelineView(.animation) { context in
            let period = busy ? 0.85 : 4.2
            let turn = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Palette.line, lineWidth: 1)
                Text("J")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Palette.cyan)
                RoundedRectangle(cornerRadius: 8)
                    .trim(from: 0, to: 0.28)
                    .stroke(Color(red: 0.84, green: 0.93, blue: 0.96), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                    .rotationEffect(.degrees(turn * 360))
            }
        }
    }
}

struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13))
            .foregroundStyle(Palette.text)
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(configuration.isPressed ? Palette.cyan.opacity(0.1) : Color.clear)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Palette.line))
    }
}

enum Palette {
    static let bg = Color(red: 0.027, green: 0.043, blue: 0.071)
    static let panel = Color(red: 0.055, green: 0.078, blue: 0.118)
    static let line = Color.white.opacity(0.12)
    static let text = Color(red: 0.95, green: 0.965, blue: 0.984)
    static let muted = Color(red: 0.545, green: 0.604, blue: 0.671)
    static let cyan = Color(red: 0.62, green: 0.79, blue: 0.84)
    static let green = Color(red: 0.56, green: 0.75, blue: 0.66)
}

struct ChatMessage: Identifiable, Codable, Equatable {
    var id = UUID()
    var role: String
    var text: String
}

struct Conversation: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var messages: [ChatMessage]
}

enum ConversationStore {
    private static let key = "jarvis.conversations"

    static func load() -> [Conversation] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode([Conversation].self, from: data) else { return [] }
        return decoded
    }

    static func save(_ items: [Conversation]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

struct MachineSnapshot {
    var model: String
    var memoryGigabytes: Double
    var cpuPercent: Double?
    var memoryPercent: Double?
    var thermal: String
    var apps: [String]
}

@MainActor
final class MachineModel: ObservableObject {
    @Published var cpuPercent: Double?
    @Published var memoryPercent: Double?
    @Published var thermal = "Nominal"
    @Published var apps: [String] = []
    @Published var summary = "Reading this Mac."
    private var previousTicks: (user: UInt32, system: UInt32, idle: UInt32, nice: UInt32)?

    func watch() async {
        while !Task.isCancelled {
            refresh()
            try? await Task.sleep(for: .seconds(2))
        }
    }

    func snapshot() -> MachineSnapshot {
        MachineSnapshot(
            model: Self.modelIdentifier(),
            memoryGigabytes: Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824,
            cpuPercent: cpuPercent,
            memoryPercent: memoryPercent,
            thermal: thermal,
            apps: apps
        )
    }

    private func refresh() {
        cpuPercent = sampleCPU()
        memoryPercent = sampleMemory()
        thermal = Self.thermalName(ProcessInfo.processInfo.thermalState)
        apps = NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular }
            .compactMap(\.localizedName)
            .filter { $0 != "JARVIS" }
            .prefix(5)
            .map { $0 }
        let memory = String(format: "%.0f GiB", Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824)
        let cpu = cpuPercent.map { "CPU \(Int($0.rounded()))%" } ?? "CPU unavailable"
        let ram = memoryPercent.map { "memory \(Int($0.rounded()))%" } ?? "memory unavailable"
        summary = "\(Self.modelIdentifier()) · \(memory) · \(cpu) · \(ram) · thermal \(thermal)."
    }

    private func sampleCPU() -> Double? {
        var info = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, rebound, &count)
            }
        }
        guard result == KERN_SUCCESS else { return nil }
        let ticks = (info.cpu_ticks.0, info.cpu_ticks.1, info.cpu_ticks.2, info.cpu_ticks.3)
        defer { previousTicks = ticks }
        guard let previous = previousTicks else { return nil }
        let user = ticks.0 &- previous.0
        let system = ticks.1 &- previous.1
        let idle = ticks.2 &- previous.2
        let nice = ticks.3 &- previous.3
        let total = Double(user &+ system &+ idle &+ nice)
        guard total > 0 else { return nil }
        return min(100, max(0, Double(user &+ system &+ nice) / total * 100))
    }

    private func sampleMemory() -> Double? {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride)
        let result = withUnsafeMutablePointer(to: &stats) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                host_statistics64(mach_host_self(), HOST_VM_INFO64, rebound, &count)
            }
        }
        guard result == KERN_SUCCESS else { return nil }
        var page: vm_size_t = 0
        guard host_page_size(mach_host_self(), &page) == KERN_SUCCESS, page > 0 else { return nil }
        let usedPages = UInt64(stats.active_count) &+ UInt64(stats.wire_count) &+ UInt64(stats.compressor_page_count)
        let used = usedPages &* UInt64(page)
        let total = ProcessInfo.processInfo.physicalMemory
        guard total > 0 else { return nil }
        return min(100, Double(used) / Double(total) * 100)
    }

    private static func modelIdentifier() -> String {
        var size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        guard size > 1 else { return "Mac" }
        var buffer = [CChar](repeating: 0, count: size)
        guard sysctlbyname("hw.model", &buffer, &size, nil, 0) == 0 else { return "Mac" }
        return String(cString: buffer)
    }

    private static func thermalName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "Nominal"
        case .fair: return "Fair"
        case .serious: return "Serious"
        case .critical: return "Critical"
        @unknown default: return "Unavailable"
        }
    }
}

enum Advisor {
    static func spanish(_ text: String) -> Bool {
        let asked = text.lowercased()
        if asked.range(of: #"[áéíóúüñ¿¡]"#, options: .regularExpression) != nil { return true }
        let keys = ["hola", "gracias", "calor", "caliente", "lento", "rápido", "rapido", "juego", "ventilador", "memoria", "optimiz", "problema", "por qué", "qué pasa", "puedes", "español"]
        return keys.contains { asked.contains($0) }
    }

    static func reply(to question: String, machine: MachineSnapshot) -> String {
        let asked = question.lowercased()
        let es = spanish(question)
        let heat = machine.thermal == "Serious" || machine.thermal == "Critical" || asked.contains("hot") || asked.contains("warm") || asked.contains("fan") || asked.contains("calor") || asked.contains("caliente") || asked.contains("ventilador")
        let optimize = asked.contains("optim") || asked.contains("faster") || asked.contains("gaming") || asked.contains("tune") || asked.contains("slow") || asked.contains("lento") || asked.contains("rápido") || asked.contains("rapido") || asked.contains("mejorar")
        let greeting = asked.contains("hola") || asked.contains("hello") || asked.contains("hi ") || asked.hasPrefix("hi")
        let memory = machine.memoryPercent ?? 0
        let heavy = machine.apps.first
        var lines: [String] = []
        if greeting && !heat && !optimize {
            if es {
                return "Hola. Estoy en \(machine.model) con \(String(format: "%.0f", machine.memoryGigabytes)) GiB. El estado térmico es \(machine.thermal). Dime qué notas o pide optimizar este Mac."
            }
            return "Hi. I'm on \(machine.model) with \(String(format: "%.0f", machine.memoryGigabytes)) GiB. Thermal state is \(machine.thermal). Tell me what feels wrong, or ask to optimize this Mac."
        }
        lines.append(es
            ? "\(machine.model), \(String(format: "%.0f", machine.memoryGigabytes)) GiB. Estado térmico: \(machine.thermal)."
            : "\(machine.model), \(String(format: "%.0f", machine.memoryGigabytes)) GiB. Thermal state is \(machine.thermal).")
        if let cpu = machine.cpuPercent {
            lines.append(es ? "La CPU está al \(Int(cpu.rounded())) por ciento." : "CPU is at \(Int(cpu.rounded())) percent.")
        } else {
            lines.append(es ? "La carga de CPU aún no está disponible. Pregunta otra vez en unos segundos." : "CPU load is not available yet. Ask again in a few seconds.")
        }
        if let ram = machine.memoryPercent {
            lines.append(es ? "La memoria está al \(Int(ram.rounded())) por ciento." : "Memory is at \(Int(ram.rounded())) percent.")
        }
        if let heavy {
            lines.append(es ? "\(heavy) es una de las apps abiertas." : "\(heavy) is one of the open apps.")
        }
        if asked.contains("what can you read") || asked.contains("what can you see") || asked.contains("qué puedes") || asked.contains("que puedes") {
            lines.append(es
                ? "Esta versión de App Store puede leer la carga de CPU, la memoria, el modelo del Mac y el estado térmico del sistema. La velocidad del ventilador y la temperatura de la GPU no están disponibles porque Apple no permite esos sensores privados en una app de la tienda."
                : "This App Store build can read CPU load, memory, the Mac model, and the system thermal state. Fan speed and GPU temperature stay unavailable because Apple does not allow those private sensors in a store app.")
            return lines.joined(separator: " ")
        }
        if heat {
            lines.append(es
                ? "El problema es el calor. macOS ha subido el estado térmico, o notas el Mac caliente. Cierra la app abierta más pesada, pon el Mac en una superficie dura y deja libres las rejillas. Luego pregunta otra vez y compara el estado térmico."
                : "The problem is heat. macOS has raised the thermal state, or you can feel the Mac getting warm. Close the heaviest open app, keep the Mac on a hard surface, and leave the vents clear. Then ask again and compare the thermal state.")
        }
        if optimize || heat || memory >= 85 {
            lines.append(es
                ? "Plan gratis. Cierra las apps que no uses, baja la escala de resolución del juego y deja libres las rejillas. En este Mac no hay una tarjeta gráfica aparte que se pueda ajustar."
                : "Free plan. Close apps you are not using, lower the game resolution scale, and keep the vents clear. There is no separate graphics card to tune on this Mac.")
            lines.append(es
                ? "Plan de pago. En la mayoría de MacBooks la memoria va soldada, así que comprar RAM no es un paso para esta máquina. El único cambio de hardware sería otro ordenador, y no hace falta gastar dinero."
                : "Paid plan. Memory on most MacBooks is soldered, so a RAM purchase is not a step for this machine. A different computer is the only hardware change, and you do not need to spend money.")
            lines.append(es ? "El plan gratis es el mejor comienzo." : "The free plan is the better start.")
        } else if lines.count < 3 {
            lines.append(es
                ? "Dime qué falla, o pide optimizar este Mac. Te daré un plan gratis y un plan de pago."
                : "Ask what feels wrong, or ask to optimize this Mac. You will get a free plan and a paid plan.")
        }
        return lines.joined(separator: " ")
    }
}
