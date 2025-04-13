import { createDefaultAminoConverters } from "@cosmjs/stargate";
import * as lavajs from "@lavanet/lavajs";

export interface IMsgBase {
  typeUrl: string | null;
  toProto(): {
    typeUrl: string;
    value: Uint8Array;
  };
  toBinary(): Uint8Array;
  toAmino(): {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
}

export class MsgBase implements IMsgBase {
  static aminoConverters = new Map(
    Object.entries({
      ...createDefaultAminoConverters(),
      ...lavajs.lavanetAminoConverters,
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public value: any;
  public typeUrl: string = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(value: any) {
    this.value = value;
  }

  public toProto(): {
    typeUrl: string;
    value: Uint8Array;
  } {
    return {
      typeUrl: this.typeUrl,
      value: this.toBinary(),
    };
  }
  public aminoType() {
    return MsgBase.aminoConverters.get(this.typeUrl);
  }

  public toBinary(): Uint8Array {
    throw new Error("Not implemented");
  }

  public toAmino(): {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  } {
    const aminoType = this.aminoType();
    if (!aminoType) {
      throw new Error("No amino type for " + this.typeUrl);
    }
    return {
      type: aminoType.aminoType,
      value: aminoType.toAmino(this.value),
    };
  }
}
