https://script.google.com/macros/s/AKfycbzeEdY7SPqM5y7wLapl34XUWQ5jUbcjaqbrBtZh_QKLbUvwRX8WtBHZjO16kZ9LLyi1/exec

https://script.google.com/macros/s/AKfycbz4ZiRm6pONwbeeSLwZ7lx9bZMQWIDf7tCucUc73_pbmudoimYACqn6kiR3zJpV6np5/exec

https://script.google.com/macros/s/AKfycbzPphEigUXVQnH2QUvpmTt-R1tDf3D_I9UnTqBs-D5axUp31zcy6i0ptYiL6rol5hCU/exec// ═════════════════════════════════════════════════════════════════════════════
// Vedanta Academy — Students Script (Enrollments + Accounts + Progress + Chapter Assignments)
// Handles both READ (doGet) and WRITE (doPost) for student ecosystem management.
//
// Sheet: https://docs.google.com/spreadsheets/d/1wvypBGtxO2v78csjnzEksUhnScbB0UKkpE1m7kJdexY
//
// ── TABS REQUIRED IN THIS SHEET ─────────────────────────────────────────────
//
//   Existing:
//     Enrollments     — one row per enrolment form submission
//     Accounts        — StudentID | Username | Password | FullName | ClassLevel | Active
//     StudentProgress — StudentID | StudentName | Subject | Topic | ModuleID |
//                       QuestionNumber | AnswerGiven | CorrectAnswer | Status | Date | Timestamp
//
//   Added/Other Tabs:
//     ParentTeacher   — ID | FullName | Email | Username | Password | Role | LinkedStudentIDs | Active
//     Assignments     — AssignmentID | StudentID | Subject | Title | Description | DueDate | 
//                       Status | Grade | Difficulty | ClassLevel | TeacherNotes | CreatedDate
//     Attendance      — StudentID | Date | Present | ClassSubject | Notes
//     Progress        — StudentID | Subject | TopicsDone | TotalTopics | QuestionsAttempted | 
//                       QuestionsCorrect | LastUpdated
//     ChapterAssignments — AssignmentID | StudentID | StudentName | ClassLevel | Subject | ModuleID |
//                          ChapterTitle | FromQuestion | ToQuestion | TotalQuestions | AssignedDate |
//                          Comments | Status | CreatedBy | CreatedDate | CompletedDate
//
// ═════════════════════════════════════════════════════════════════════════════

// ── GLOBAL CONSTANTS FOR CHAPTER ASSIGNMENTS ─────────────────────────────────
const CHAPTER_ASSIGNMENTS_TAB = 'ChapterAssignments';
const CHAPTER_ASSIGNMENTS_HEADERS = [
  'AssignmentID', 'StudentID', 'StudentName', 'ClassLevel', 'Subject',
  'ModuleID', 'ChapterTitle', 'FromQuestion', 'ToQuestion', 'TotalQuestions',
  'AssignedDate', 'Comments', 'Status', 'CreatedBy', 'CreatedDate', 'CompletedDate',
];

// ── GET MAIN DISPATCHER ──────────────────────────────────────────────────────
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'all';

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── chapterAssignments (GET) ─────────────────────────────────────────────
    if (action === 'chapterAssignments') {
      var studentId = (e.parameter.studentId || '').trim();
      var sheet = getOrCreateChapterAssignmentsSheet_(ss);
      var all = chapterAssignmentsRowsToObjects_(sheet);
      var filtered = studentId ? all.filter(function(r) { return String(r.StudentID).trim() === studentId; }) : all;
      return jsonOut({ assignments: filtered });
    }

    // ── accounts ──────────────────────────────────────────────────────────────
    if (action === 'accounts') {
      var sheet = ss.getSheetByName('Accounts');
      if (!sheet) return jsonOut({ error: 'Accounts tab not found.' });
      var rows = sheetToObjects(sheet).filter(function(r) {
        return String(r['StudentID'] || '').trim() || String(r['Username']  || '').trim();
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
          return String(r['StudentID'] || '').trim().toLowerCase() === String(studentId).trim().toLowerCase();
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

    // ── weightedLeaderboard (only assigned-range questions, ranked by accuracy,
    //    min attempts to qualify) — see buildWeightedLeaderboard() below ───────
    if (action === 'weightedLeaderboard') {
      var wlProgressSheet = ss.getSheetByName('StudentProgress');
      var wlAssignSheet   = getOrCreateChapterAssignmentsSheet_(ss);
      if (!wlProgressSheet) return jsonOut({ error: 'StudentProgress tab not found.' });
      return jsonOut(buildWeightedLeaderboard(
        sheetToObjects(wlProgressSheet),
        chapterAssignmentsRowsToObjects_(wlAssignSheet)
      ));
    }

    // ── portalStats (public home page dashboard) ──────────────────────────────
    if (action === 'portalStats') {
      var accSheet = ss.getSheetByName('Accounts');
      var totalStudents = accSheet
        ? sheetToObjects(accSheet).filter(function(r) {
            return String(r['StudentID'] || '').trim() || String(r['Username']  || '').trim();
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

    // ── assignments (per-student generic) ─────────────────────────────────────
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
        Object.keys(latest).forEach(function(k) {
          var r = latest[k];
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
            TopicsDone:          '',
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
          rowIdx = i;
          break;
        }
      }
      if (rowIdx === -1) return jsonOut({ error: 'Student not found: ' + sid });
      
      // Only safe fields. StudentID, Username, Active never changed here.
      var allowedFields = ['FullName', 'ClassLevel', 'Email', 'Phone', 'Address', 'Password'];
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

// ── POST DISPATCHER: write datasets ──────────────────────────────────────────
function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── createChapterAssignment (POST) ───────────────────────────────────────
    if (action === 'createChapterAssignment') {
      var body = JSON.parse(e.postData.contents || '{}');
      var sheet = getOrCreateChapterAssignmentsSheet_(ss);

      var from  = Number(body.fromQuestion) || 1;
      var to    = Number(body.toQuestion)   || from;
      var total = Number(body.totalQuestions) || (to - from + 1);

      var assignmentId = 'CA' + new Date().getTime();
      var now = new Date();
      var row = {
        AssignmentID:    assignmentId,
        StudentID:       body.studentId    || '',
        StudentName:     body.studentName  || '',
        ClassLevel:      body.classLevel   || '',
        Subject:         body.subject      || '',
        ModuleID:        body.moduleId     || '',
        ChapterTitle:    body.chapterTitle || '',
        FromQuestion:    from,
        ToQuestion:      to,
        TotalQuestions:  total,
        AssignedDate:    body.assignedDate || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        Comments:        body.comments     || '',
        Status:          'Task assigned',
        CreatedBy:       body.createdBy    || '',
        CreatedDate:     now.toISOString(),
        CompletedDate:   '',
      };
      sheet.appendRow(CHAPTER_ASSIGNMENTS_HEADERS.map(function(h) { return row[h]; }));
      return jsonOut({ success: true, assignment: row });
    }

    // ── completeChapterAssignment (POST) ─────────────────────────────────────
    if (action === 'completeChapterAssignment') {
      var body = JSON.parse(e.postData.contents || '{}');
      var assignmentId = (body.assignmentId || '').trim();
      var sheet = getOrCreateChapterAssignmentsSheet_(ss);
      var values = sheet.getDataRange().getValues();
      var headers = values[0];
      var idCol     = headers.indexOf('AssignmentID');
      var statusCol = headers.indexOf('Status');
      var doneCol   = headers.indexOf('CompletedDate');
      
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][idCol]).trim() === assignmentId) {
          sheet.getRange(i + 1, statusCol + 1).setValue('Completed');
          sheet.getRange(i + 1, doneCol + 1).setValue(new Date().toISOString());
          return jsonOut({ success: true });
        }
      }
      return jsonOut({ success: false, message: 'Assignment not found.' });
    }

    // ── ptLinkStudent (POST) ──────────────────────────────────────────────────
    if (action === 'ptLinkStudent') {
      return ptUpdateLinkedStudents_(e, 'add', ss);
    }

    // ── ptUnlinkStudent (POST) ────────────────────────────────────────────────
    if (action === 'ptUnlinkStudent') {
      return ptUpdateLinkedStudents_(e, 'remove', ss);
    }

    // ── Legacy Body Payload Post Processing ──────────────────────────────────
    var payload = JSON.parse(e.postData.contents);
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
    if (payload.testTime) {
      var t  = payload.testTime;
      // BUGFIX: this used to do SpreadsheetApp.openById('YOUR_STUDENTS_SHEET_ID')
      // with a `const ss` that shadowed the real spreadsheet reference above —
      // 'YOUR_STUDENTS_SHEET_ID' was a placeholder, never a real sheet ID, so
      // openById() threw on every call and the row never got written. Reuse
      // the already-open spreadsheet (`ss`, from SpreadsheetApp.getActiveSpreadsheet()
      // at the top of doPost) instead.
      var ttSheet = ss.getSheetByName('TestTimeLogs');
      if (!ttSheet) {
        ttSheet = ss.insertSheet('TestTimeLogs');
        ttSheet.appendRow(['StudentID','StudentName','ClassLevel','Subject','Topic',
                            'ModuleID','TotalSeconds','HH:MM:SS','CompletedAt','Date']);
      }
      var ttSecs = Number(t.TotalSeconds) || 0;
      var ttHms  = new Date(ttSecs * 1000).toISOString().slice(11, 19);
      ttSheet.appendRow([t.StudentID, t.StudentName, t.ClassLevel, t.Subject, t.Topic,
                          t.ModuleID, ttSecs, ttHms, t.CompletedAt, t.Date]);

      // Also stamp TimeTakenSeconds onto the matching StudentProgress rows for
      // this StudentID + ModuleID, so the per-question rows used by the
      // "Completed Topics" summary (portal.js reads r.TimeTakenSeconds) carry
      // a value even for students who only ever got the *total* test time
      // (not a per-question time) logged for this module.
      var spSheetForTime = ss.getSheetByName('StudentProgress');
      if (spSheetForTime && t.StudentID && t.ModuleID) {
        var spValues  = spSheetForTime.getDataRange().getValues();
        var spHeaders = spValues[0].map(String);
        var sidCol    = spHeaders.indexOf('StudentID');
        var midCol    = spHeaders.indexOf('ModuleID');
        var ttsCol    = spHeaders.indexOf('TimeTakenSeconds');
        if (ttsCol === -1) {
          // Column doesn't exist on this tab yet — add it rather than
          // silently dropping the data.
          spSheetForTime.getRange(1, spHeaders.length + 1).setValue('TimeTakenSeconds');
          ttsCol = spHeaders.length;
        }
        if (sidCol !== -1 && midCol !== -1) {
          for (var r = 1; r < spValues.length; r++) {
            var rowHasNoTime = !spValues[r][ttsCol];
            if (String(spValues[r][sidCol]).trim() === String(t.StudentID).trim() &&
                String(spValues[r][midCol]).trim() === String(t.ModuleID).trim() &&
                rowHasNoTime) {
              spSheetForTime.getRange(r + 1, ttsCol + 1).setValue(ttSecs);
            }
          }
        }
      }

      return jsonOut({ success: true, hms: ttHms, totalSeconds: ttSecs });
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

// ── Chapter Assignments Sheet Sub-Helpers ────────────────────────────────────
function getOrCreateChapterAssignmentsSheet_(ss) {
  let sheet = ss.getSheetByName(CHAPTER_ASSIGNMENTS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CHAPTER_ASSIGNMENTS_TAB);
    sheet.getRange(1, 1, 1, CHAPTER_ASSIGNMENTS_HEADERS.length).setValues([CHAPTER_ASSIGNMENTS_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function chapterAssignmentsRowsToObjects_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

// ── Parent / Teacher Linking Sub-Helpers ─────────────────────────────────────
function ptUpdateLinkedStudents_(e, mode, ss) {
  const body = JSON.parse(e.postData.contents || '{}');
  const ptId = (body.ptId || '').trim();
  const studentId = (body.studentId || '').trim();
  if (!ptId || !studentId) {
    return jsonOut({ success: false, message: 'ptId and studentId are required.' });
  }

  const sheet = ss.getSheetByName('ParentTeacher');
  if (!sheet) return jsonOut({ error: 'ParentTeacher tab not found.' });
  
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idCol     = headers.indexOf('ID');
  const linkedCol = headers.indexOf('LinkedStudentIDs');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === ptId) {
      const raw = String(values[i][linkedCol] || '').trim();
      if (raw === '*') {
        // Already sees every student — nothing to add/remove individually.
        return jsonOut({ success: true, linkedStudentIDs: ['*'] });
      }
      let ids = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (mode === 'add' && !ids.includes(studentId)) ids.push(studentId);
      if (mode === 'remove') ids = ids.filter(id => id !== studentId);
      
      sheet.getRange(i + 1, linkedCol + 1).setValue(ids.join(','));
      return jsonOut({ success: true, linkedStudentIDs: ids });
    }
  }
  return jsonOut({ success: false, message: 'Parent/teacher account not found.' });
}

// ── Leaderboard aggregation ───────────────────────────────────────────────────
function buildLeaderboard(rows) {
  var latest = {};
  var todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
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
    var ts      = r['Timestamp'] || '';

    if (!perStudent[sid]) {
      perStudent[sid] = { 
        studentId: sid, 
        studentName: name,
        correct: 0, 
        attempted: 0, 
        lastActivity: '', 
        todayAttempted: 0,
        bySubject: {} 
      };
    }
    
    var s = perStudent[sid];
    s.studentName = name || s.studentName;
    s.attempted++;
    if (isOk) s.correct++;
    
    if (ts && ts.slice(0, 10) === todayStr) {
      s.todayAttempted++;
    }
    if (String(ts) > String(s.lastActivity)) {
      s.lastActivity = ts;
    }

    if (!s.bySubject[subject]) s.bySubject[subject] = { correct: 0, attempted: 0, lastActivity: '', todayAttempted: 0 };
    var sub = s.bySubject[subject];
    sub.attempted++;
    if (isOk) sub.correct++;
    if (ts && ts.slice(0, 10) === todayStr) sub.todayAttempted++;
    if (String(ts) > String(sub.lastActivity)) sub.lastActivity = ts;
  });

  var overall = Object.values(perStudent).map(function(s) {
    return {
      studentId:      s.studentId,
      studentName:    s.studentName,
      correct:        s.correct,
      attempted:      s.attempted,
      accuracy:       s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0,
      lastActivity:   s.lastActivity,
      todayAttempted: s.todayAttempted
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
        studentId:      s.studentId,
        studentName:    s.studentName,
        correct:        sub.correct,
        attempted:      sub.attempted,
        accuracy:       sub.attempted ? Math.round((sub.correct / sub.attempted) * 100) : 0,
        lastActivity:   sub.lastActivity,
        todayAttempted: sub.todayAttempted
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

// ── Weighted Leaderboard aggregation ──────────────────────────────────────────
// Only counts StudentProgress rows that fall inside a range the student was
// actually assigned via ChapterAssignments (same StudentID + ModuleID,
// QuestionNumber between FromQuestion..ToQuestion). Requires at least
// MIN_ASSIGNED_ATTEMPTS assigned questions attempted to qualify, and ranks
// by accuracy % rather than raw attempted count. Row/response shape mirrors
// buildLeaderboard() so the existing Leaderboard UI can be reused as-is.
var MIN_ASSIGNED_ATTEMPTS = 50;

function buildWeightedLeaderboard(progressRows, assignmentRows) {
  // 1. Build per-student assigned ranges: studentId -> [{moduleId, from, to}]
  var assignedRanges = {};
  assignmentRows.forEach(function(a) {
    var sid = String(a['StudentID'] || '').trim();
    if (!sid) return;
    (assignedRanges[sid] = assignedRanges[sid] || []).push({
      moduleId: String(a['ModuleID'] || ''),
      from:     Number(a['FromQuestion']) || 0,
      to:       Number(a['ToQuestion'])   || 0,
    });
  });

  // 2. Dedupe StudentProgress to latest attempt per StudentID+ModuleID+QuestionNumber,
  //    same as buildLeaderboard(), then keep only rows inside an assigned range.
  var latest = {};
  progressRows.forEach(function(r) {
    var key = [r['StudentID'], r['ModuleID'], r['QuestionNumber']].join('|');
    var ts  = r['Timestamp'] || '';
    if (!latest[key] || String(ts) > String(latest[key]['Timestamp'] || ''))
      latest[key] = r;
  });

  var perStudent = {};
  Object.keys(latest).forEach(function(key) {
    var r   = latest[key];
    var sid = String(r['StudentID'] || '').trim();
    if (!sid) return;

    var ranges = assignedRanges[sid];
    if (!ranges || !ranges.length) return; // never assigned anything -> excluded

    var moduleId = String(r['ModuleID'] || '');
    var qNum     = Number(r['QuestionNumber']) || 0;
    var inRange  = ranges.some(function(rg) {
      return rg.moduleId === moduleId && qNum >= rg.from && qNum <= rg.to;
    });
    if (!inRange) return;

    var name    = r['StudentName'] || sid;
    var subject = r['Subject'] || 'General';
    var isOk    = String(r['Status'] || '').trim().toLowerCase() === 'correct';
    var ts      = r['Timestamp'] || '';

    if (!perStudent[sid]) {
      perStudent[sid] = { studentId: sid, studentName: name, correct: 0, attempted: 0, lastActivity: '', bySubject: {} };
    }
    var s = perStudent[sid];
    s.studentName = name || s.studentName;
    s.attempted++;
    if (isOk) s.correct++;
    if (String(ts) > String(s.lastActivity)) s.lastActivity = ts;

    if (!s.bySubject[subject]) s.bySubject[subject] = { correct: 0, attempted: 0, lastActivity: '' };
    var sub = s.bySubject[subject];
    sub.attempted++;
    if (isOk) sub.correct++;
    if (String(ts) > String(sub.lastActivity)) sub.lastActivity = ts;
  });

  // 3. Filter by MIN_ASSIGNED_ATTEMPTS, compute accuracy, sort desc by accuracy.
  function toRow(sid, name, stats) {
    return {
      studentId:    sid,
      studentName:  name,
      correct:      stats.correct,
      attempted:    stats.attempted,
      accuracy:     stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0,
      lastActivity: stats.lastActivity,
    };
  }

  var overall = Object.values(perStudent)
    .filter(function(s) { return s.attempted >= MIN_ASSIGNED_ATTEMPTS; })
    .map(function(s) { return toRow(s.studentId, s.studentName, s); })
    .sort(function(a, b) { return b.accuracy - a.accuracy || b.correct - a.correct; });

  var bySubject = {};
  Object.values(perStudent).forEach(function(s) {
    Object.keys(s.bySubject).forEach(function(subject) {
      var sub = s.bySubject[subject];
      if (sub.attempted < MIN_ASSIGNED_ATTEMPTS) return;
      (bySubject[subject] = bySubject[subject] || []).push(toRow(s.studentId, s.studentName, sub));
    });
  });
  Object.keys(bySubject).forEach(function(subject) {
    bySubject[subject].sort(function(a, b) { return b.accuracy - a.accuracy || b.correct - a.correct; });
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

// ── Core Legacy Helpers ───────────────────────────────────────────────────────
function appendRow(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];

  // BUGFIX: matching used to be exact-case only, so a payload field like
  // "timeTakenSeconds" would silently fail to match a "TimeTakenSeconds"
  // header (and vice versa) and the value would just be dropped. Match
  // case-insensitively instead.
  var valueByLowerKey = {};
  Object.keys(obj).forEach(function(k) { valueByLowerKey[k.toLowerCase()] = obj[k]; });

  // BUGFIX: if the incoming payload has a field the sheet doesn't have a
  // column for yet (e.g. TimeTakenSeconds added to the app before the sheet
  // was updated), auto-create the column instead of silently losing the
  // data.
  var haveLowerHeader = {};
  headers.forEach(function(h) { haveLowerHeader[h.toLowerCase()] = true; });
  var missingHeaders = Object.keys(obj).filter(function(k) { return !haveLowerHeader[k.toLowerCase()]; });
  if (missingHeaders.length) {
    sheet.getRange(1, headers.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    headers = headers.concat(missingHeaders);
  }

  var row = headers.map(function(h) {
    var v = valueByLowerKey[h.toLowerCase()];
    return v !== undefined ? v : '';
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
        obj[String(headers[j])] = (data[i][j] !== undefined && data[i][j] !== null) ? String(data[i][j]) : '';
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