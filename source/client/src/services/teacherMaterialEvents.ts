export const teacherMaterialChanged = 'grammarquest:teacher-materials-changed'

export function notifyTeacherMaterialChanged() {
  window.dispatchEvent(new Event(teacherMaterialChanged))
  try {
    localStorage.setItem(teacherMaterialChanged, crypto.randomUUID())
  } catch {
    /* Optional cross-tab notification. */
  }
}
