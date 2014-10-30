var fs = require('fs');
var path = require('path');

function startsWith(str, pattern) {
    return str.slice(0, pattern.length) === pattern;
}

function endsWith(str, pattern) {
    return str.slice(-pattern.length) === pattern;
}

function stripComments(str) {

    var current = '';
    var next = '';
    var end = -1;
    var cmd = '';

    var i = 0;
    while (i < str.length) {
        current = str[i];
        next = str[i + 1] || '';

        if (current + next === '--') { // must be first
            end = str.indexOf('\n', i);
            i = end;
        } else if (current + next === '/*') {
            end = str.indexOf('*/', i);
            i = end + 2;
        } else {
            cmd += current;
            i++;
        }
    }

    return cmd;
}

// call stripComments() first
function parseCommands(str) {

    var current = '';
    var next = '';
    var end = -1;
    var cmd = '';
    var pattern = '';
    var list = [];

    var i = 0;
    while (i < str.length) {
        current = str[i];
        next = str[i + 1] || '';

        if (current === "'") {
            end = str.indexOf("'", i + 1);
            cmd += str.slice(i, end + 1);
            i = end + 1;
        } else if (current === '"') {
            end = str.indexOf('"', i + 1);
            cmd += str.slice(i, end + 1);
            i = end + 1;
        } else if (current === '$') {
            end = str.indexOf('$', i + 1);
            pattern = str.slice(i, end + 1);
            end = str.indexOf(pattern, end + 1);
            cmd += str.slice(i, end + pattern.length);
            i = end + pattern.length;
        } else if (current === ';') {
            list.push(cmd.trim());
            cmd = '';
            i++;
        } else {
            cmd += current;
            i++;
        }
    }

    return list;
}

// call parseCommands() first
function parseIncludes(parentFile, commands) {

    var result = [];

    for (var i = 0; i < commands.length; i++) {
        var cmd = commands[i];

        if (startsWith(cmd.toUpperCase(), 'INCLUDE SQL') === true) {
            var sqlPath = cmd.replace(/INCLUDE SQL/i, '').trim();

            // remove surrounding quotes
            sqlPath = sqlPath.slice(1, sqlPath.length - 1);

            // is relative path?
            if (path.resolve(sqlPath) !== sqlPath) { 
                sqlPath = path.dirname(parentFile) + '/' + sqlPath;
            }

            var str = fs.readFileSync(sqlPath).toString();
            str = stripComments(str);
            var cmds = parseCommands(str);
            cmds = parseIncludes(sqlPath, cmds);

            result = result.concat(cmds);
        } else {
            result.push(cmd);
        }
    }

    return result;
}

// call parseIncludes() first
function stripNestedTransactions(commands) {

    var result = [];
    var transactions = [];
    var removeIndexes = [];

    // find all transactions
    for (var i = 0; i < commands.length; i++) {
        var cmd = commands[i];

        if (startsWith(cmd.toUpperCase(), 'BEGIN') === true) {
            transactions.push({
                begin: i,
                commit: null,
            });
        } else if (startsWith(cmd.toUpperCase(), 'COMMIT') === true) {

            for (var j = transactions.length - 1; j >= 0; j--) {
                if (transactions[j].commit === null) {
                    transactions[j].commit = i;
                    break;
                }
            }
        }
    }

    // determine which transactions are nested
    for (var i = 0; i < transactions.length; i++) {

        for (var j = 0; j < transactions.length; j++) {
            if (i !== j
                && transactions[j].begin > transactions[i].begin
                && transactions[j].commit < transactions[i].commit) {
                removeIndexes.push(transactions[j].begin);
                removeIndexes.push(transactions[j].commit);
            }
        }
    }

    // remove nested transctions
    // do not use splice() since that removes elements in-place 
    for (var i = 0; i < commands.length; i++) {
        if (removeIndexes.indexOf(i) === -1) {
            result.push(commands[i]);
        }
    }

    return result;
}

function preprocess(fileName) {

    var str = fs.readFileSync(fileName).toString();
    str = stripComments(str);
    var cmds = parseCommands(str);
    cmds = parseIncludes(fileName, cmds);
    cmds = stripNestedTransactions(cmds);

    return cmds.join(';\n') + ';';
}

module.exports = preprocess;