// ═════════════════════════════════════════════════════════════════════════════
// Vedanta Academy — Students Script (Enrollments + Accounts + Progress)
// Handles both READ (doGet) and WRITE (doPost) for enrolment and progress
//
// Sheet: https://docs.google.com/spreadsheets/d/1wvypBGtxO2v78csjnzEksUhnScbB0UKkpE1m7kJdexY
//
// ── TABS REQUIRED IN THIS SHEET ─────────────────────────────────────────────
//
//   Existing (unchanged):
//     Enrollments  — one row per enrolment form submission
//     Accounts     — StudentID | Username | Password | FullName | ClassLevel | Active
//     StudentProgress — StudentID | StudentName | Subject | Topic | ModuleID |
//                       QuestionNumber | AnswerGiven | CorrectAnswer | Status |
//                       Date | Timestamp
//
//   NEW tabs:
//     ParentTeacher — ID | FullName | Email | Username | Password | Role |
//                     LinkedStudentIDs | Active
//     Assignments   — AssignmentID | StudentID | Subject | Title | Description |
//                     DueDate | Status | Grade | Difficulty | ClassLevel |
//                     TeacherNotes | CreatedDate
//     Attendance    — StudentID | Date | Present | ClassSubject | Notes
//     Progress      — StudentID | Subject | TopicsDone | TotalTopics |
//                     QuestionsAttempted | QuestionsCorrect | LastUpdated
//
// ═════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action)
    ? e.parameter.action : 'all';

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── accounts ──────────────────────────────────────────────────────────────
    if (action === 'accounts') {
      var sheet = ss.getSheetByName('Accounts');
      if (!sheet) return jsonOut({ error: 'Accounts tab not found.' });
      var rows = sheetToObjects(sheet).filter(function(r) {
        return String(r['StudentID'] || '').trim() ||
               String(r['Username']  || '').trim();
      });
      return jsonOut({ accounts: rows });
    }

    // ── enrollments ───────────────────────────────────────────────────────────
    if (action === 'enrollments') {
      var sheet = ss.getSheetByName('Enrollments');
      if (!sheet) return jsonOut({ error: 'Enrollments tab not found.' });
      return jsonOut({ enrollments: sheetToObjects(sheet) });
    }

    // ── progress (raw per-question rows, optionally filtered by studentId) ────
    if (action === 'progress') {
      var pSheet = ss.getSheetByName('StudentProgress');
      if (!pSheet) return jsonOut({ error: 'StudentProgress tab not found.' });
      var progressRows = sheetToObjects(pSheet);
      var studentId = e.parameter.studentId;
      if (studentId) {
        progressRows = progressRows.filter(function(r) {
          return String(r['StudentID'] || '').trim().toLowerCase() ===
                 String(studentId).trim().toLowerCase();
        });
      }
      return jsonOut({ progress: progressRows });
    }

    // ── leaderboard ───────────────────────────────────────────────────────────
    if (action === 'leaderboard') {
      var lSheet = ss.getSheetByName('StudentProgress');
      if (!lSheet) return jsonOut({ error: 'StudentProgress tab not found.' });
      return jsonOut(buildLeaderboard(sheetToObjects(lSheet)));
    }

    // ── portalStats (public home page dashboard) ──────────────────────────────
    if (action === 'portalStats') {
      var accSheet = ss.getSheetByName('Accounts');
      var totalStudents = accSheet
        ? sheetToObjects(accSheet).filter(function(r) {
            return String(r['StudentID'] || '').trim() ||
                   String(r['Username']  || '').trim();
          }).length
        : 0;
      var pgSheet = ss.getSheetByName('StudentProgress');
      var progressRows = pgSheet ? sheetToObjects(pgSheet) : [];
      return jsonOut(buildPortalStats(totalStudents, progressRows));
    }

    // ── ptAuth (parent/teacher login) ─────────────────────────────────────────
    if (action === 'ptAuth') {
      var ptSheet = ss.getSheetByName('ParentTeacher');
      if (!ptSheet) return jsonOut({
        error: 'ParentTeacher tab not found. Create it with columns: ' +
               'ID | FullName | Email | Username | Password | Role | LinkedStudentIDs | Active'
      });
      return jsonOut({ accounts: sheetToObjects(ptSheet) });
    }

    // ── assignments (per-student) ─────────────────────────────────────────────
    if (action === 'assignments') {
      var sid = String(e.parameter.studentId || '').trim().toLowerCase();
      if (!sid) return jsonOut({ error: 'studentId is required.' });
      var aSheet = ss.getSheetByName('Assignments');
      if (!aSheet) return jsonOut({
        error: 'Assignments tab not found. Columns: AssignmentID | StudentID | ' +
               'Subject | Title | Description | DueDate | Status | Grade | ' +
               'Difficulty | ClassLevel | TeacherNotes | CreatedDate'
      });
      var assignments = sheetToObjects(aSheet).filter(function(r) {
        return String(r['StudentID'] || '').trim().toLowerCase() === sid;
      });
      return jsonOut({ assignments: assignments });
    }

    // ── attendance (per-student) ──────────────────────────────────────────────
    if (action === 'attendance') {
      var sid = String(e.parameter.studentId || '').trim().toLowerCase();
      if (!sid) return jsonOut({ error: 'studentId is required.' });
      var attSheet = ss.getSheetByName('Attendance');
      if (!attSheet) return jsonOut({
        error: 'Attendance tab not found. Columns: StudentID | Date | Present | ClassSubject | Notes'
      });
      var records = sheetToObjects(attSheet).filter(function(r) {
        return String(r['StudentID'] || '').trim().toLowerCase() === sid;
      });
      var total    = records.length;
      var attended = records.filter(function(r) {
        var v = String(r['Present'] || '').trim().toUpperCase();
        return v === 'TRUE' || v === 'YES' || v === '1';
      }).length;
      var summary = {
        total:    total,
        attended: attended,
        absent:   total - attended,
        rate:     total ? Math.round((attended / total) * 100) : 0
      };
      return jsonOut({ records: records, summary: summary });
    }

    // ── subjectProgress (per-student, merges Progress tab + StudentProgress) ──
    if (action === 'subjectProgress') {
      var sid = String(e.parameter.studentId || '').trim().toLowerCase();
      if (!sid) return jsonOut({ error: 'studentId is required.' });

      var progSheet = ss.getSheetByName('Progress');
      var teacherRows = [];
      if (progSheet) {
        teacherRows = sheetToObjects(progSheet).filter(function(r) {
          return String(r['StudentID'] || '').trim().toLowerCase() === sid;
        });
      }

      var spSheet = ss.getSheetByName('StudentProgress');
      var autoRows = [];
      if (spSheet) {
        var allProgress = sheetToObjects(spSheet).filter(function(r) {
          return String(r['StudentID'] || '').trim().toLowerCase() === sid;
        });
        var latest = {};
        allProgress.forEach(function(r) {
          var key = [r['ModuleID'], r['QuestionNumber']].join('|');
          var ts  = r['Timestamp'] || '';
          if (!latest[key] || String(ts) > String(latest[key]['Timestamp'] || ''))
            latest[key] = r;
        });
        var bySubject = {};
        Object.values(latest).forEach(function(r) {
          var subj = r['Subject'] || 'Unknown';
          if (!bySubject[subj]) bySubject[subj] = { correct: 0, attempted: 0, lastTs: '' };
          bySubject[subj].attempted++;
          if (String(r['Status'] || '').trim().toLowerCase() === 'correct')
            bySubject[subj].correct++;
          if ((r['Timestamp'] || '') > bySubject[subj].lastTs)
            bySubject[subj].lastTs = r['Timestamp'];
        });
        autoRows = Object.keys(bySubject).map(function(subj) {
          var s = bySubject[subj];
          return {
            Subject:            subj,
            TopicsDone:         '',
            TotalTopics:        '',
            QuestionsAttempted: String(s.attempted),
            QuestionsCorrect:   String(s.correct),
            LastUpdated:        s.lastTs ? s.lastTs.slice(0, 10) : ''
          };
        });
      }

      var teacherSubjects = {};
      teacherRows.forEach(function(r) { teacherSubjects[r['Subject']] = true; });
      var combined = teacherRows.concat(
        autoRows.filter(function(r) { return !teacherSubjects[r['Subject']]; })
      );
      return jsonOut({ subjects: combined });
    }

    // ── updateAccount (profile edit — updates Accounts row by StudentID) ──────
    if (action === 'updateAccount') {
      var sid = String(e.parameter.studentId || '').trim();
      if (!sid) return jsonOut({ error: 'studentId is required.' });

      var accSheet = ss.getSheetByName('Accounts');
      if (!accSheet) return jsonOut({ error: 'Accounts tab not found.' });

      var data    = accSheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h).trim(); });
      var sidIdx  = headers.indexOf('StudentID');
      if (sidIdx === -1) return jsonOut({ error: 'StudentID column not found in Accounts tab.' });

      var rowIdx = -1;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][sidIdx]).trim().toLowerCase() === sid.toLowerCase()) {
          rowIdx = i; break;
        }
      }
      if (rowIdx === -1) return jsonOut({ error: 'Student not found: ' + sid });

      // Only safe, non-sensitive fields. Password/Username/Active never changed here.
      var allowedFields = ['FullName', 'ClassLevel', 'Email', 'Phone', 'Address'];
      var updated = [];
      allowedFields.forEach(function(field) {
        var colIdx = headers.indexOf(field);
        if (colIdx === -1) return;
        var newVal = e.parameter[field];
        if (newVal === undefined || newVal === null) return;
        accSheet.getRange(rowIdx + 1, colIdx + 1).setValue(String(newVal));
        updated.push(field);
      });

      return jsonOut({ success: true, updated: updated, studentId: sid });
    }

    // ── default: return all enrollments + accounts ────────────────────────────
    return jsonOut({
      enrollments: safeTab(ss, 'Enrollments'),
      accounts:    safeTab(ss, 'Accounts')
    });

  } catch (err) {
    return jsonOut({ error: err.toString() });
  }
}

// ── POST: write new enrolment, account, progress event, or PT registration ───
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss      = SpreadsheetApp.getActiveSpreadsheet();

    if (payload.enrollment) {
      var eSheet = ss.getSheetByName('Enrollments');
      if (!eSheet) return jsonOut({ error: 'Enrollments tab not found.' });
      appendRow(eSheet, payload.enrollment);
    }

    if (payload.account) {
      var aSheet = ss.getSheetByName('Accounts');
      if (!aSheet) return jsonOut({ error: 'Accounts tab not found.' });
      appendRow(aSheet, payload.account);
    }

    if (payload.progress) {
      var pSheet = ss.getSheetByName('StudentProgress');
      if (!pSheet) return jsonOut({ error: 'StudentProgress tab not found.' });
      appendRow(pSheet, payload.progress);
    }

    if (payload.parentTeacher) {
      var ptSheet = ss.getSheetByName('ParentTeacher');
      if (!ptSheet) return jsonOut({
        error: 'ParentTeacher tab not found. Create it with columns: ' +
               'ID | FullName | Email | Username | Password | Role | LinkedStudentIDs | Active'
      });
      appendRow(ptSheet, payload.parentTeacher);
    }

    return jsonOut({ success: true });

  } catch (err) {
    return jsonOut({ error: err.toString() });
  }
}

// ── Leaderboard aggregation ───────────────────────────────────────────────────
function buildLeaderboard(rows) {
  var latest = {};
  rows.forEach(function(r) {
    var key = [r['StudentID'], r['ModuleID'], r['QuestionNumber']].join('|');
    var ts  = r['Timestamp'] || '';
    if (!latest[key] || String(ts) > String(latest[key]['Timestamp'] || ''))
      latest[key] = r;
  });

  var perStudent = {};
  Object.keys(latest).forEach(function(key) {
    var r       = latest[key];
    var sid     = String(r['StudentID'] || '').trim();
    if (!sid) return;
    var name    = r['StudentName'] || sid;
    var subject = r['Subject'] || 'General';
    var isOk    = String(r['Status'] || '').trim().toLowerCase() === 'correct';

    if (!perStudent[sid])
      perStudent[sid] = { studentId: sid, studentName: name,
                          correct: 0, attempted: 0, bySubject: {} };
    var s = perStudent[sid];
    s.studentName = name || s.studentName;
    s.attempted++;
    if (isOk) s.correct++;
    if (!s.bySubject[subject]) s.bySubject[subject] = { correct: 0, attempted: 0 };
    s.bySubject[subject].attempted++;
    if (isOk) s.bySubject[subject].correct++;
  });

  var overall = Object.values(perStudent).map(function(s) {
    return {
      studentId:   s.studentId,
      studentName: s.studentName,
      correct:     s.correct,
      attempted:   s.attempted,
      accuracy:    s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0
    };
  }).sort(function(a, b) {
    return b.correct - a.correct || b.accuracy - a.accuracy;
  });

  var bySubject = {};
  Object.values(perStudent).forEach(function(s) {
    Object.keys(s.bySubject).forEach(function(subject) {
      if (!bySubject[subject]) bySubject[subject] = [];
      var sub = s.bySubject[subject];
      bySubject[subject].push({
        studentId:   s.studentId,
        studentName: s.studentName,
        correct:     sub.correct,
        attempted:   sub.attempted,
        accuracy:    sub.attempted ? Math.round((sub.correct / sub.attempted) * 100) : 0
      });
    });
  });
  Object.keys(bySubject).forEach(function(subject) {
    bySubject[subject].sort(function(a, b) {
      return b.correct - a.correct || b.accuracy - a.accuracy;
    });
  });

  return { overall: overall, bySubject: bySubject };
}

// ── Portal stats aggregation ──────────────────────────────────────────────────
function buildPortalStats(totalStudents, rows) {
  var latest = {};
  rows.forEach(function(r) {
    var key = [r['StudentID'], r['ModuleID'], r['QuestionNumber']].join('|');
    var ts  = r['Timestamp'] || '';
    if (!latest[key] || String(ts) > String(latest[key]['Timestamp'] || ''))
      latest[key] = r;
  });
  var dedupedRows = Object.values(latest);

  var totalQuestionsAttempted = dedupedRows.length;
  var totalCorrectAnswers     = dedupedRows.filter(function(r) {
    return String(r['Status'] || '').trim().toLowerCase() === 'correct';
  }).length;

  var seen = {}, activity = [];
  var sorted = dedupedRows.slice().sort(function(a, b) {
    return String(b['Timestamp'] || '').localeCompare(String(a['Timestamp'] || ''));
  });
  sorted.forEach(function(r) {
    var key = [r['StudentID'], r['ModuleID']].join('|');
    if (seen[key]) return;
    seen[key] = true;
    if (activity.length < 8) {
      activity.push({
        studentName: r['StudentName'] || r['StudentID'] || 'A student',
        subject:     r['Subject']  || '',
        topic:       r['Topic']    || '',
        timestamp:   r['Timestamp']|| ''
      });
    }
  });

  return {
    totalStudents:           totalStudents,
    totalQuestionsAttempted: totalQuestionsAttempted,
    totalCorrectAnswers:     totalCorrectAnswers,
    recentActivity:          activity
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function appendRow(sheet, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) {
    return obj[String(h)] !== undefined ? obj[String(h)] : '';
  });
  sheet.appendRow(row);
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var result  = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {}, hasData = false;
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[String(headers[j])] = (data[i][j] !== undefined && data[i][j] !== null)
          ? String(data[i][j]) : '';
        if (obj[String(headers[j])]) hasData = true;
      }
    }
    if (hasData) result.push(obj);
  }
  return result;
}

function safeTab(ss, name) {
  var sheet = ss.getSheetByName(name);
  return sheet ? sheetToObjects(sheet) : [];
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
