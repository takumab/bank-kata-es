import { describe, expect, test } from "bun:test";

enum EventType {
  AccountCreated = "AccountCreated",
  DepositConfirmed = "DepositConfirmed",
}

type Payload = {
  accountId: string;
};

type BaseAccountEvent = {
  eventId: string;
  eventType: EventType;
  payload: Payload;
};

type AccountCreatedEventPayload = Payload & {
  email: string;
};

type AccountCreatedEvent = BaseAccountEvent & {
  payload: AccountCreatedEventPayload;
};

type DepositConfirmedEventPayload = Payload & {
  email: string;
  amount: number;
};

type DepositConfirmedEvent = BaseAccountEvent & {
  payload: DepositConfirmedEventPayload;
};

type Customer = {
  email: string;
};

type Account = {
  id: string;
  balance: number;
  customer: Customer;
};

class AccountEventHandler {
  private readonly eventsRepository: EventsRepository;
  private readonly accountEventProcessor: AccountEventProcessor;

  constructor({
    eventsRepository,
    accountEventProcessor,
  }: {
    eventsRepository: EventsRepository;
    accountEventProcessor: AccountEventProcessor;
  }) {
    this.eventsRepository = eventsRepository;
    this.accountEventProcessor = accountEventProcessor;
  }

  async send(event: AccountCreatedEvent | DepositConfirmedEvent) {
    await this.eventsRepository.save(event);
    await this.accountEventProcessor.buildProjection(event.payload.accountId);
  }
}

class AccountsRepository {
  private readonly accounts: Array<Account> = [];

  async findAllBy(email: string): Promise<Array<Account>> {
    return this.accounts.filter(
      (account: Account) => account.customer.email === email,
    );
  }

  async save(account: Account) {
    this.accounts.push(account);
  }

  async findById(accountId: string): Promise<Account | undefined> {
    return this.accounts.find((account: Account) => account.id === accountId);
  }
}

class EventsRepository {
  private events: BaseAccountEvent[] = [];
  async findById(eventId: string): Promise<BaseAccountEvent | undefined> {
    return this.events.find(
      (event: BaseAccountEvent) => event.eventId === eventId,
    );
  }

  async save(event: BaseAccountEvent) {
    this.events.push(event);
  }

  findAllBy(accountId: string): BaseAccountEvent[] {
    return this.events.filter(
      (event: BaseAccountEvent) => event.payload.accountId === accountId,
    );
  }
}

class AccountEventProcessor {
  private eventsRepository: EventsRepository;
  private accountsRepository: AccountsRepository;
  constructor({
    eventsRepository,
    accountsRepository,
  }: {
    eventsRepository: EventsRepository;
    accountsRepository: AccountsRepository;
  }) {
    this.eventsRepository = eventsRepository;
    this.accountsRepository = accountsRepository;
  }

  async buildProjection(accountId: string) {
    // TODO: support other event types beyond accountCreatedEvents and depositConfirmedEvent
    const accountEvents = this.eventsRepository
      .findAllBy(accountId)
      .filter(isAccountCreatedOrDepositConfirmedEvent);
    const emptyAccount = { id: "", balance: 0, customer: { email: "" } };

    const account = accountEvents.reduce((account, event) => {
      if (event.eventType === EventType.DepositConfirmed) {
        const depositConfirmedEvent = event as DepositConfirmedEvent;
        return {
          ...account,
          id: accountId,
          balance: depositConfirmedEvent.payload.amount,
          customer: { email: event.payload.email },
        };
      }
      return {
        ...account,
        id: accountId,
        balance: 0,
        customer: { email: event.payload.email },
      };
    }, emptyAccount);

    await this.accountsRepository.save(account);
  }
}

const isAccountCreatedOrDepositConfirmedEvent = (
  event: BaseAccountEvent,
): event is AccountCreatedEvent | DepositConfirmedEvent => {
  return (
    event.eventType === EventType.AccountCreated ||
    event.eventType === EventType.DepositConfirmed
  );
};

const eventsRepository = new EventsRepository();
const accountsRepository = new AccountsRepository();
const accountEventProcessor = new AccountEventProcessor({
  eventsRepository,
  accountsRepository,
});
const accountEventHandler = new AccountEventHandler({
  eventsRepository,
  accountEventProcessor,
});

describe("Bank Account", () => {
  describe("when new AccountCreatedEvent is received", () => {
    test("AccountCreatedEvent should be processed and saved", async () => {
      const email = "olu@example.com";
      const accountId = "123";
      const payload: AccountCreatedEventPayload = {
        accountId,
        email,
      };
      const accountCreatedEvent: AccountCreatedEvent = {
        eventId: "1",
        eventType: EventType.AccountCreated,
        payload,
      };

      await accountEventHandler.send(accountCreatedEvent);
      const accounts = await accountsRepository.findAllBy(email);

      expect(accounts.at(0)?.customer.email).toBe(email);
      expect(accounts.at(0)?.balance).toBe(0);
      expect(accounts.length).toBe(1);
    });
  });

  describe("when new DepositConfirmedEvent is received", () => {
    test("DepositConfirmedEvent should be processed and saved", async () => {
      const email = "olu@example.com";
      const accountId = "1234";
      const payload: DepositConfirmedEventPayload = {
        accountId,
        email,
        amount: 100,
      };
      const depositConfirmedEvent: DepositConfirmedEvent = {
        eventId: "2",
        eventType: EventType.DepositConfirmed,
        payload,
      };

      await accountEventHandler.send(depositConfirmedEvent);
      const accounts = await accountsRepository.findAllBy(email);

      expect(accounts.at(1)?.customer.email).toBe(email);
      expect(accounts.at(1)?.balance).toBe(100);
      expect(accounts.length).toBe(2);
    });
  });
});

describe("Unit - AccountEventHandler", () => {
  test("should save the AccountCreatedEvent in events repository", async () => {
    const email = "olu@example.com";
    const accountId = "123";
    const payload: AccountCreatedEventPayload = {
      accountId,
      email,
    };

    const accountCreatedEvent: AccountCreatedEvent = {
      eventId: "1",
      eventType: EventType.AccountCreated,
      payload,
    };
    const eventsRepository = new EventsRepository();

    const accountEventProcessor = new AccountEventProcessor({
      eventsRepository,
      accountsRepository,
    });
    const accountEventHandler = new AccountEventHandler({
      eventsRepository: eventsRepository,
      accountEventProcessor: accountEventProcessor,
    });

    await accountEventHandler.send(accountCreatedEvent);

    const result = await eventsRepository.findById(accountCreatedEvent.eventId);
    expect(result).toEqual(accountCreatedEvent);
  });

  test("should save the DepositConfirmedEvent to the events repository", async () => {
    const email = "olu@example.com";
    const accountId = "1234";
    const payload: DepositConfirmedEventPayload = {
      accountId,
      email,
      amount: 100,
    };

    let depositConfirmedEvent: DepositConfirmedEvent = {
      eventId: "2",
      eventType: EventType.DepositConfirmed,
      payload,
    };
    const eventsRepository = new EventsRepository();

    const accountEventProcessor = new AccountEventProcessor({
      eventsRepository,
      accountsRepository,
    });
    const accountEventHandler = new AccountEventHandler({
      eventsRepository: eventsRepository,
      accountEventProcessor: accountEventProcessor,
    });

    await accountEventHandler.send(depositConfirmedEvent);

    let result = await eventsRepository.findById(depositConfirmedEvent.eventId);
    expect(result).toEqual(depositConfirmedEvent);
  });
});

describe("Unit - AccountEventProcessor", () => {
  test("should build an account projection", async () => {
    const email = "olu@example.com";
    const accountId = "123";
    const payload: AccountCreatedEventPayload = {
      accountId,
      email,
    };

    const accountCreatedEvent: AccountCreatedEvent = {
      eventId: "1",
      eventType: EventType.AccountCreated,
      payload,
    };

    const eventsRepository = new EventsRepository();
    await eventsRepository.save(accountCreatedEvent);

    const accountEventProcessor = new AccountEventProcessor({
      eventsRepository,
      accountsRepository,
    });
    await accountEventProcessor.buildProjection(accountId);

    const account = await accountsRepository.findById(accountId);
    expect(account).toEqual({
      id: accountId,
      balance: 0,
      customer: { email },
    });
  });

  test("should build an account projection from a deposit confirmed event", async () => {
    const email = "olu@example.com";
    const accountId = "1234";
    const payload: DepositConfirmedEventPayload = {
      accountId,
      email,
      amount: 100,
    };

    const depositConfirmedEvent: DepositConfirmedEvent = {
      eventId: "1",
      eventType: EventType.DepositConfirmed,
      payload,
    };

    const eventsRepository = new EventsRepository();
    await eventsRepository.save(depositConfirmedEvent);

    const accountEventProcessor = new AccountEventProcessor({
      eventsRepository,
      accountsRepository,
    });

    await accountEventProcessor.buildProjection(accountId);

    const account = await accountsRepository.findById(accountId);
    expect(account).toEqual({
      id: accountId,
      balance: 100,
      customer: { email },
    });
  });
});
