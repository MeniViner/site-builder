const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => document?.[key] === expected);
}

function applyUpdate(document, update) {
  if (update.$set) {
    Object.entries(update.$set).forEach(([key, value]) => {
      document[key] = clone(value);
    });
  }
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, value]) => {
      document[key] = Number(document[key] || 0) + Number(value);
    });
  }
  return document;
}

class MemoryCursor {
  constructor(items) {
    this.items = items;
  }

  sort(sortSpec = {}) {
    const entries = Object.entries(sortSpec);
    this.items.sort((a, b) => {
      for (const [key, direction] of entries) {
        const aValue = a?.[key];
        const bValue = b?.[key];
        if (aValue === bValue) continue;
        return (aValue > bValue ? 1 : -1) * (direction < 0 ? -1 : 1);
      }
      return 0;
    });
    return this;
  }

  async toArray() {
    return clone(this.items);
  }
}

class MemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = [];
  }

  async createIndex() {
    return `${this.name}_idx`;
  }

  async insertOne(doc) {
    const next = clone(doc);
    if (next._id === undefined) {
      next._id = `${this.name}_${this.docs.length + 1}`;
    }
    if (this.docs.some((item) => item._id === next._id)) {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    this.docs.push(next);
    return { acknowledged: true, insertedId: next._id };
  }

  async findOne(filter = {}) {
    const found = this.docs.find((doc) => matches(doc, filter));
    return found ? clone(found) : null;
  }

  find(filter = {}) {
    return new MemoryCursor(this.docs.filter((doc) => matches(doc, filter)).map(clone));
  }

  async updateOne(filter = {}, update = {}) {
    const doc = this.docs.find((item) => matches(item, filter));
    if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    applyUpdate(doc, update);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  async countDocuments(filter = {}) {
    return this.docs.filter((doc) => matches(doc, filter)).length;
  }
}

export class MemoryDb {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MemoryCollection(name));
    }
    return this.collections.get(name);
  }
}

export default MemoryDb;
