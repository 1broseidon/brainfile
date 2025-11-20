// Simple integration test for @bangbang/core
const { BangBang, BUILT_IN_TEMPLATES } = require('./dist/index');

console.log('Testing @bangbang/core library...\n');

// Test 1: Parse a simple board
console.log('Test 1: Parsing a simple board');
const markdown = `---
title: Test Project
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Test Task
        description: Test description
---
`;

const board = BangBang.parse(markdown);
if (board && board.title === 'Test Project') {
  console.log('✓ Parsing works correctly');
} else {
  console.error('✗ Parsing failed');
  process.exit(1);
}

// Test 2: Validate the parsed board
console.log('\nTest 2: Validating the parsed board');
const validation = BangBang.validate(board);
if (validation.valid) {
  console.log('✓ Validation works correctly');
} else {
  console.error('✗ Validation failed:', validation.errors);
  process.exit(1);
}

// Test 3: Serialize the board back to markdown
console.log('\nTest 3: Serializing the board');
const serialized = BangBang.serialize(board);
if (serialized.includes('title: Test Project')) {
  console.log('✓ Serialization works correctly');
} else {
  console.error('✗ Serialization failed');
  process.exit(1);
}

// Test 4: Test templates
console.log('\nTest 4: Testing templates');
const templates = BangBang.getBuiltInTemplates();
if (templates.length === 3) {
  console.log(`✓ Found ${templates.length} built-in templates`);
} else {
  console.error('✗ Expected 3 templates, found', templates.length);
  process.exit(1);
}

// Test 5: Create task from template
console.log('\nTest 5: Creating task from template');
try {
  const bugTask = BangBang.createFromTemplate('bug-report', {
    title: 'Login button broken',
    description: 'Users cannot login'
  });

  if (bugTask.title === 'Login button broken' && bugTask.priority === 'high') {
    console.log('✓ Template processing works correctly');
  } else {
    console.error('✗ Template processing failed');
    process.exit(1);
  }
} catch (error) {
  console.error('✗ Template creation failed:', error.message);
  process.exit(1);
}

// Test 6: Test task location finding
console.log('\nTest 6: Finding task location');
const location = BangBang.findTaskLocation(markdown, 'task-1');
if (location && location.line > 0) {
  console.log(`✓ Found task at line ${location.line}`);
} else {
  console.error('✗ Task location finding failed');
  process.exit(1);
}

console.log('\n🎉 All tests passed!');
console.log('\nPackage summary:');
console.log('=================');
console.log('• Parser: ✓');
console.log('• Serializer: ✓');
console.log('• Validator: ✓');
console.log('• Templates: ✓');
console.log('• Location finder: ✓');
console.log('\n@bangbang/core is ready to use!');
