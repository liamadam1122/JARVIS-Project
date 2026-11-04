#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static void join2(char *out, size_t n, const char *a, const char *b) {
  snprintf(out, n, "%s\\%s", a, b);
}

static int file_exists(const char *path) {
  DWORD a = GetFileAttributesA(path);
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static int dir_exists(const char *path) {
  DWORD a = GetFileAttributesA(path);
  return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

static int looks_like_app(const char *dir) {
  char server[MAX_PATH];
  char node[MAX_PATH];
  join2(server, sizeof(server), dir, "server.mjs");
  snprintf(node, sizeof(node), "%s\\runtime\\node.exe", dir);
  return file_exists(server) && file_exists(node);
}

static int find_app_dir(const char *here, char *out, size_t n) {
  char candidate[MAX_PATH];
  join2(candidate, sizeof(candidate), here, "app");
  if (looks_like_app(candidate)) {
    strncpy(out, candidate, n - 1);
    out[n - 1] = 0;
    return 1;
  }
  if (looks_like_app(here)) {
    strncpy(out, here, n - 1);
    out[n - 1] = 0;
    return 1;
  }

  WIN32_FIND_DATAA fd;
  char pattern[MAX_PATH];
  join2(pattern, sizeof(pattern), here, "*");
  HANDLE h = FindFirstFileA(pattern, &fd);
  if (h == INVALID_HANDLE_VALUE) return 0;
  do {
    if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
    if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0) continue;
    char child[MAX_PATH];
    join2(child, sizeof(child), here, fd.cFileName);
    if (looks_like_app(child)) {
      strncpy(out, child, n - 1);
      out[n - 1] = 0;
      FindClose(h);
      return 1;
    }
    char nested[MAX_PATH];
    join2(nested, sizeof(nested), child, "app");
    if (looks_like_app(nested)) {
      strncpy(out, nested, n - 1);
      out[n - 1] = 0;
      FindClose(h);
      return 1;
    }
  } while (FindNextFileA(h, &fd));
  FindClose(h);
  return 0;
}

static void exe_dir(char *out, size_t n) {
  GetModuleFileNameA(NULL, out, (DWORD)n);
  char *slash = strrchr(out, '\\');
  if (slash) *slash = 0;
}

static int run_hidden(const char *cmd) {
  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  ZeroMemory(&pi, sizeof(pi));
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  char buf[2048];
  strncpy(buf, cmd, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = 0;
  if (!CreateProcessA(NULL, buf, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
    return 0;
  }
  WaitForSingleObject(pi.hProcess, 120000);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  return 1;
}

static int try_unpack_from_downloads(char *app_out, size_t n) {
  char local[MAX_PATH];
  char dest[MAX_PATH];
  char cmd[1600];
  if (!SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, local))) {
    return 0;
  }
  snprintf(dest, sizeof(dest), "%s\\JARVIS\\gaming-pc", local);

  const char *profiles[] = {
    "%USERPROFILE%\\Downloads\\JARVIS-gaming-pc.zip",
    "%USERPROFILE%\\Downloads\\JARVIS-gaming-laptop.zip",
    "%USERPROFILE%\\Downloads\\JARVIS-windows-computer.zip",
    "%USERPROFILE%\\Desktop\\JARVIS-gaming-pc.zip",
  };

  for (int i = 0; i < 4; i++) {
    char zip[MAX_PATH];
    if (!ExpandEnvironmentStringsA(profiles[i], zip, sizeof(zip))) continue;
    if (!file_exists(zip)) continue;

    snprintf(cmd, sizeof(cmd),
      "powershell -NoProfile -ExecutionPolicy Bypass -Command "
      "\"$d='%s'; if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force }; "
      "New-Item -ItemType Directory -Path $d | Out-Null; "
      "Expand-Archive -LiteralPath '%s' -DestinationPath $d -Force\"",
      dest, zip);
    if (!run_hidden(cmd)) continue;
    if (find_app_dir(dest, app_out, n)) return 1;
  }
  return 0;
}

static int launch_app(const char *app_dir) {
  char node[MAX_PATH];
  char cmd[1024];
  snprintf(node, sizeof(node), "%s\\runtime\\node.exe", app_dir);
  ShellExecuteA(NULL, "open", "http://127.0.0.1:4173", NULL, NULL, SW_SHOWNORMAL);

  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  ZeroMemory(&pi, sizeof(pi));
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  snprintf(cmd, sizeof(cmd), "\"%s\" \"%s\\server.mjs\"", node, app_dir);
  if (!CreateProcessA(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, app_dir, &si, &pi)) {
    return 0;
  }
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  return 1;
}

int WINAPI WinMain(HINSTANCE a, HINSTANCE b, LPSTR c, int d) {
  (void)a; (void)b; (void)c; (void)d;
  char here[MAX_PATH];
  char app[MAX_PATH];
  exe_dir(here, sizeof(here));

  if (!find_app_dir(here, app, sizeof(app))) {
    if (!try_unpack_from_downloads(app, sizeof(app))) {
      MessageBoxA(NULL,
        "JARVIS kon de bestanden niet vinden.\n\n"
        "1. Ga naar Downloads\n"
        "2. Rechtermuisklik op JARVIS-gaming-pc.zip\n"
        "3. Kies Alles uitpakken...\n"
        "4. Open de NIEUWE map\n"
        "5. Dubbelklik op JARVIS.exe\n\n"
        "Open GEEN bestanden vanuit het zip-venster.",
        "JARVIS", MB_OK | MB_ICONWARNING);
      return 1;
    }
  }

  if (!launch_app(app)) {
    MessageBoxA(NULL,
      "JARVIS startte niet.\nProbeer opnieuw of download v0.2.7 opnieuw.",
      "JARVIS", MB_OK | MB_ICONERROR);
    return 1;
  }
  return 0;
}
