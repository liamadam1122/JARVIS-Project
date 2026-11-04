const SPANISH_HINT = /[áéíóúüñ¿¡]|(\b(hola|gracias|por\s+favor|ayuda|calor|caliente|lento|lent[oa]|r[aá]pido|juego|juegos|ventilador|memoria|optimiza(?:r|ción|cion)?|arreglar|problema|por\s+qu[eé]|qu[eé]\s+pasa|puedes|puedo|necesito|escribe|correo|trabajo|espa[nñ]ol|castellano|ordena(?:dor)?|port[aá]til)\b)/i;

export function detectLanguage(text = "", preferred = "") {
  const forced = String(preferred || "").toLowerCase();
  if (forced === "es" || forced === "en") return forced;
  const sample = String(text || "");
  if (!sample.trim()) return "en";
  return SPANISH_HINT.test(sample) ? "es" : "en";
}

export function replyInLanguageInstruction(lang) {
  if (lang === "es") {
    return "Answer in natural Spanish (Spain). Match the user's language. Keep the same calm voice. Do not mix English and Spanish in one reply unless the user mixed them.";
  }
  return "Answer in natural English. Match the user's language. Keep the same calm voice. Do not mix English and Spanish in one reply unless the user mixed them.";
}

export function machinePlaybookLocalized(device = {}, lang = "en") {
  const gpu = Array.isArray(device.gpuModels) ? device.gpuModels.join(" ") : "";
  const id = `${device.manufacturer || ""} ${device.model || ""} ${device.macModel || ""} ${gpu}`.toLowerCase();
  const discrete = /nvidia|geforce|rtx|gtx|radeon|\brx\s?\d|arc a\d/i.test(gpu);
  const mac = device.platform === "darwin" || /macbook|imac|mac mini|mac studio/.test(id);
  const laptop = device.formFactor === "laptop";
  const es = lang === "es";
  const plugged = device.acConnected === false
    ? (es ? " Está con batería, así que conéctalo a la corriente antes de juzgar el rendimiento." : " It is on battery, so plug it in before judging game performance.")
    : "";

  if (mac) {
    return {
      kind: "mac",
      guidance: es
        ? "Esto es un Mac. Muestra CPU, GPU, memoria y ventilador cuando existan esas lecturas. No digas que se puede tunear, overclockear o cambiar una tarjeta gráfica aparte. En la mayoría de Mac la memoria va soldada."
        : "This is a Mac. Show CPU, GPU, memory, and fan speed when those readings exist. Do not claim a separate graphics card can be tuned, overclocked, or replaced. Most Mac memory is soldered.",
      free: es
        ? "Plan gratis. Cierra la app más pesada, baja la escala de resolución del juego y deja libres las rejillas. En este Mac no hay una tarjeta gráfica aparte que se pueda ajustar."
        : "Free plan. Close the heaviest app, lower the game resolution scale, and keep the vents clear. There is no separate graphics card to tune on this Mac.",
      paid: es
        ? "Plan de pago. En la mayoría de MacBooks no se puede ampliar la memoria. El único cambio de hardware sería otro ordenador, y no hace falta gastar dinero."
        : "Paid plan. A memory upgrade is not available on most MacBooks. A different computer is the only hardware change, and you do not need to spend money.",
    };
  }
  if (laptop && !discrete) {
    const vendor = /lenovo|thinkpad/.test(id)
      ? (es ? "En Lenovo Vantage, elige Intelligent Cooling o el modo equilibrado." : "In Lenovo Vantage, set Intelligent Cooling or the balanced performance mode.")
      : (es ? "Usa la app de energía o temperatura del fabricante si ya está instalada." : "Use the laptop maker's own power or thermal app if it is already installed.");
    return {
      kind: "laptop",
      guidance: es
        ? `Esto es un portátil sin GPU de juegos aparte.${plugged} Ayuda con calor, ventiladores, memoria y apps de inicio. No inventes una tarjeta gráfica de juegos y no sugieras overclock. ${vendor}`
        : `This is a laptop without a separate gaming GPU, including many ThinkPads.${plugged} Help with heat, fans, memory, and startup apps. Do not invent a gaming graphics card and do not suggest overclocking. ${vendor}`,
      free: es
        ? `Plan gratis. ${vendor} Cierra apps pesadas de inicio y deja libres las rejillas. Esta máquina no muestra una GPU de juegos aparte, así que no hay nada que overclockear.${plugged}`
        : `Free plan. ${vendor} Close heavy startup apps and keep the vents clear. This machine does not show a separate gaming GPU, so there is nothing to overclock.${plugged}`,
      paid: es
        ? "Plan de pago. Más memoria solo si la RAM o el swap siguen altos y este portátil tiene una ranura libre. No hace falta gastar dinero."
        : "Paid plan. More memory only if RAM or swap stays high and this laptop has a free slot. You do not need to spend money.",
    };
  }
  if (laptop) {
    return {
      kind: "gaming-laptop",
      guidance: es
        ? `Esto es un portátil gaming.${plugged} Manténlo enchufado. Usa el modo de rendimiento del fabricante si esa app ya está instalada: Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center o PredatorSense. En la app NVIDIA o AMD Software, elige la GPU de alto rendimiento para el juego y limita los FPS cerca de la tasa de refresco de la pantalla. No sugieras undervolt de fuentes dudosas ni un optimizador desconocido.`
        : `This is a gaming laptop.${plugged} Stay on the charger. Use the maker's performance mode if that app is already installed: Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense. In the NVIDIA App or AMD Software, choose the high-performance GPU for the game and cap frames near the laptop screen refresh. Do not suggest a random undervolt tool or an unknown optimizer.`,
      free: es
        ? `Plan gratis. Enchufa el portátil. Pon el modo de rendimiento del fabricante en Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center o PredatorSense si esa app ya está instalada. En la app NVIDIA o AMD Software, usa el perfil oficial y limita los FPS cerca del refresco de la pantalla. Cierra la app más pesada, baja sombras antes que la resolución y deja libres las rejillas. No instales un optimizador desconocido.${plugged}`
        : `Free plan. Plug the laptop in. Set the vendor performance mode in Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense when that app is already installed. In the NVIDIA App or AMD Software, use the official profile and cap frames near the screen refresh. Close the heaviest app, lower shadows before resolution, and keep the vents clear. Do not install an unknown optimizer.${plugged}`,
      paid: es
        ? "Plan de pago. Más memoria solo si este portátil tiene ranura y la RAM o el swap siguen altos tras el plan gratis. Una base de refrigeración solo si la temperatura sigue alta con las rejillas libres. No hace falta gastar dinero."
        : "Paid plan. More memory only if this laptop has a slot and RAM or swap stays high after the free steps. A cooling pad only if the temperature stays high with clear vents. You do not need to spend money.",
    };
  }
  const linux = device.platform === "linux";
  return {
    kind: "desktop",
    guidance: es
      ? (linux
        ? "Esto es un PC de sobremesa con Linux. Usa los ajustes oficiales de NVIDIA o AMD, o CoreCtrl para AMD. No sugieras un optimizador desconocido."
        : "Esto es un PC gaming de sobremesa. En Ajustes de Windows, Sistema, Pantalla, Gráficos, pon el juego en Alto rendimiento. Usa la app NVIDIA o AMD Software para ese juego, un plan de energía de alto rendimiento al jugar, y un límite de FPS cerca del refresco del monitor. No sugieras un optimizador desconocido.")
      : (linux
        ? "This is a desktop PC on Linux. Use the official NVIDIA or AMD settings, or CoreCtrl for AMD. Do not suggest an unknown optimizer."
        : "This is a desktop gaming PC. In Windows Settings, System, Display, Graphics, set the game to High performance. Use the NVIDIA App or AMD Software for that game, a high-performance power plan while gaming, and a frame cap near the monitor refresh. Do not suggest an unknown optimizer."),
    free: es
      ? (linux
        ? "Plan gratis. Cierra la app más pesada, baja sombras antes que la resolución, y limita los FPS cerca del refresco del monitor en los ajustes oficiales de NVIDIA o AMD, o CoreCtrl para AMD. Deja libres las rejillas. No instales un optimizador desconocido."
        : "Plan gratis. En Ajustes de Windows, Sistema, Pantalla, Gráficos, pon el juego en Alto rendimiento. En la app NVIDIA o AMD Software, usa el perfil oficial y limita los FPS cerca del refresco del monitor. Usa un plan de energía de alto rendimiento al jugar. Cierra la app más pesada, baja sombras antes que la resolución y deja libres las rejillas. No instales un optimizador desconocido.")
      : (linux
        ? "Free plan. Close the heaviest app, lower shadows before resolution, and cap frames near the monitor refresh in the official NVIDIA or AMD settings, or CoreCtrl for AMD. Keep the vents clear. Do not install an unknown optimizer."
        : "Free plan. In Windows Settings, System, Display, Graphics, set the game to High performance. In the NVIDIA App or AMD Software, use the official profile and cap frames near the monitor refresh. Use a high-performance power plan while gaming. Close the heaviest app, lower shadows before resolution, and keep the vents clear. Do not install an unknown optimizer."),
    paid: es
      ? "Plan de pago. Más memoria solo si la RAM o el swap siguen altos tras el plan gratis. Mejor refrigeración solo si la temperatura sigue alta con las rejillas libres. Un monitor de más hercios solo si la pantalla actual es el límite. No hace falta gastar dinero."
      : "Paid plan. More memory only if RAM or swap stays high after the free steps. Better cooling only if the temperature stays high with clear vents. A higher-refresh monitor only if the current display is the limit. You do not need to spend money.",
  };
}
