// Supabase integration scaffold for Smart Study Buddy.
//
// SETUP:
// 1. Create a project at https://supabase.com and run supabase-schema.sql in its SQL editor.
// 2. In Project Settings > API, copy your Project URL and anon public key below.
// 3. Enable Email and Google providers under Authentication > Providers
//    (Google needs OAuth client credentials from Google Cloud Console).
// 4. Add this file to index.html with:
//      <script type="module" src="supabase-client.js"></script>
//    and replace the stub auth handlers in app.js with the functions below.
//
// This file is NOT wired into app.js automatically — the demo runs on in-memory
// state so it works without any setup. Connect it once you have real credentials.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- AUTH ----------
export async function signUpWithEmail(email, password) {
  return supabase.auth.signUp({ email, password });
}
export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({ provider: "google" });
}
export async function signOut() {
  return supabase.auth.signOut();
}
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}

// ---------- TASKS (CRUD) ----------
export async function fetchTasks() {
  const { data, error } = await supabase.from("tasks").select("*").order("deadline", { ascending: true });
  if (error) throw error;
  return data;
}
export async function createTask(task) {
  const { data, error } = await supabase.from("tasks").insert(task).select().single();
  if (error) throw error;
  return data;
}
export async function updateTask(id, patch) {
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteTask(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
export async function togglePin(id, pinned) {
  return updateTask(id, { pinned });
}

// ---------- NOTES ----------
export async function fetchNotes() {
  const { data, error } = await supabase.from("notes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function createNote(note) {
  const { data, error } = await supabase.from("notes").insert(note).select().single();
  if (error) throw error;
  return data;
}
export async function deleteNote(id) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

// ---------- TIMER SESSIONS (for analytics) ----------
export async function logTimerSession(taskId, startedAt, elapsedSeconds) {
  const { error } = await supabase.from("timer_sessions").insert({
    task_id: taskId, started_at: startedAt, elapsed_seconds: elapsedSeconds,
  });
  if (error) throw error;
}
export async function fetchWeeklyHours() {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data, error } = await supabase
    .from("timer_sessions")
    .select("elapsed_seconds, started_at")
    .gte("started_at", since.toISOString());
  if (error) throw error;
  return data;
}

// ---------- PROFILE / THEME ----------
export async function saveTheme(userId, theme) {
  const { error } = await supabase.from("profiles").update({ theme }).eq("id", userId);
  if (error) throw error;
}
