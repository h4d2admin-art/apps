export type Shift = 'morning' | 'evening';
export interface Student { id: string; name: string; phone: string; parentName: string; parentPhone: string; notes: string; createdAt: string }
export interface Enrollment { id: string; studentId: string; month: string; desk: number; fee: number }
export interface Payment { id: string; enrollmentId: string; amount: number; date: string; note: string }
export interface Slot { id: string; label: string; start: string; end: string }
export interface Session { id: string; date: string; month: string; shift: Shift; supervisor: string; supervisorPhone: string; slots: Slot[]; attendance: Record<string, string[]> }
export interface ConductRecord { id: string; studentId: string; month: string; date: string; kind: 'positive' | 'negative'; title: string; points: number; notes: string }
export interface Settings { hallName: string; deskCount: number; defaultFee: number; monthlyTargetHours: number; attendanceWeight: number; positiveTarget: number; negativeMultiplier: number }
export interface AppState { version: 1; students: Student[]; enrollments: Enrollment[]; payments: Payment[]; sessions: Session[]; records: ConductRecord[]; settings: Settings }
export type Action =
  | { type: 'student.save'; payload: Omit<Student, 'id' | 'createdAt'> & { id?: string } }
  | { type: 'enrollment.save'; payload: Omit<Enrollment, 'id'> & { id?: string } }
  | { type: 'enrollment.delete'; id: string }
  | { type: 'payment.add'; payload: Omit<Payment, 'id'> }
  | { type: 'payment.delete'; id: string }
  | { type: 'session.save'; payload: Omit<Session, 'id' | 'month' | 'attendance'> & { id?: string } }
  | { type: 'attendance.toggle'; sessionId: string; studentId: string; slotId: string }
  | { type: 'attendance.all'; sessionId: string; slotId: string; present: boolean }
  | { type: 'record.add'; payload: Omit<ConductRecord, 'id' | 'month'> }
  | { type: 'record.delete'; id: string }
  | { type: 'settings.save'; payload: Settings }
  | { type: 'backup.restore'; payload: AppState };
export type Act = (action: Action) => Promise<boolean>;
export interface PageProps { state: AppState; month: string; act: Act; busy: boolean; onMonthChange?: (month: string) => void }
export const defaultSettings: Settings = { hallName: 'سالن مطالعه هم‌درس', deskCount: 80, defaultFee: 1800000, monthlyTargetHours: 120, attendanceWeight: 80, positiveTarget: 20, negativeMultiplier: 1 };
export const initialState = (): AppState => ({ version: 1, students: [], enrollments: [], payments: [], sessions: [], records: [], settings: { ...defaultSettings } });
