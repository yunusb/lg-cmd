import { requireOptionalNativeModule } from 'expo';

type IrNativeModule = {
  isAvailable: () => boolean;
  send: (code: number) => Promise<boolean>;
};

const irModule = requireOptionalNativeModule<IrNativeModule>('LgInfrared');

export function canTransmitIR(): boolean {
  try {
    return irModule?.isAvailable() === true;
  } catch {
    return false;
  }
}

export async function transmitIR(code: number): Promise<void> {
  if (!irModule) throw new Error('Le mode infrarouge nécessite un APK EAS, pas Expo Go.');
  if (!canTransmitIR()) throw new Error('Ce téléphone ne possède pas d’émetteur infrarouge.');
  await irModule.send(code);
}
