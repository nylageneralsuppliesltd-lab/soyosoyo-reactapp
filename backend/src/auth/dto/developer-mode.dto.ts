import { IsBoolean } from 'class-validator';

export class DeveloperModeDto {
  @IsBoolean({ message: 'enabled must be true or false' })
  enabled: boolean;
}
