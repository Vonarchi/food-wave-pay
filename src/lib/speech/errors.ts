/** Customer-facing copy when the microphone fails. Ordering state is left unchanged. */
export function speechErrorCopy(code: string | undefined, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  if (code === "not-allowed" || code === "service-not-allowed") {
    return es
      ? "El micrófono está bloqueado. Puedes escribir el pedido."
      : "The microphone is blocked. You can type the order instead.";
  }
  if (code === "no-speech") {
    return es ? "No escuché nada. Intenta de nuevo." : "I didn't hear anything. Try again.";
  }
  if (code === "unsupported") {
    return es
      ? "Este navegador no tiene voz. Escribe el pedido."
      : "This browser can't use the microphone. Type the order instead.";
  }
  return es ? "La voz falló. Puedes escribir el pedido." : "Voice didn't work. You can type the order instead.";
}
