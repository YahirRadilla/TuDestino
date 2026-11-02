import bcrypt from 'bcryptjs';

// bcryptjs is pure JavaScript: no native build step on Windows/CI. Cost is configurable.
export function createPasswordService({ rounds = 12 } = {}) {
  // A real hash of a random value: comparing against it burns the same CPU time as a real check.
  let dummyHash;
  const getDummyHash = async () => {
    dummyHash ??= await bcrypt.hash(`dummy-${Math.random()}-${Date.now()}`, rounds);
    return dummyHash;
  };

  return {
    hash: (plain) => bcrypt.hash(plain, rounds),
    verify: (plain, hash) => bcrypt.compare(plain, hash),
    // Used for unknown accounts so the response time does not reveal them; always false.
    async verifyDummy(plain) {
      await bcrypt.compare(plain, await getDummyHash());
      return false;
    },
  };
}
