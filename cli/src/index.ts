// Export commands for programmatic use
export { listCommand } from './commands/list';
export { addCommand } from './commands/add';
export { moveCommand } from './commands/move';
export { templateCommand } from './commands/template';
export { lintCommand } from './commands/lint';
export {
  contractPickupCommand,
  contractDeliverCommand,
  contractValidateCommand,
  contractAttachCommand,
  contractActivateCommand,
  contractGraphCommand,
  parseContractGraphArgs,
} from './commands/contract';
export { adrPromoteCommand } from './commands/adr';
export { initCommand } from './commands/init';
export { migrateCommand } from './commands/migrate';
