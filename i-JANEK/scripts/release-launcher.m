#import <Cocoa/Cocoa.h>

typedef NS_ENUM(NSInteger, ReleaseChannel) {
    ReleaseChannelStable = 0,
    ReleaseChannelTest = 1,
    ReleaseChannelBeta = 2,
};

static BOOL IsBaseVersion(NSString *value) {
    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^\\d+\\.\\d+\\.\\d+$" options:0 error:&error];
    if (error != nil) return NO;
    return [regex firstMatchInString:value options:0 range:NSMakeRange(0, value.length)] != nil;
}

static NSURL *RootDirectory(void) {
    NSURL *url = [NSURL fileURLWithPath:NSProcessInfo.processInfo.arguments.firstObject].URLByResolvingSymlinksInPath;
    for (NSInteger index = 0; index < 4; index++) {
        url = url.URLByDeletingLastPathComponent;
    }
    return url;
}

static NSString *ReadCurrentVersion(NSURL *root, NSError **error) {
    NSURL *packageURL = [root URLByAppendingPathComponent:@"package.json"];
    NSData *data = [NSData dataWithContentsOfURL:packageURL options:0 error:error];
    if (data == nil) return nil;
    NSDictionary *package = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
    NSString *version = [package isKindOfClass:NSDictionary.class] ? package[@"version"] : nil;
    NSString *base = [version componentsSeparatedByString:@"-"].firstObject;
    if (![version isKindOfClass:NSString.class] || !IsBaseVersion(base)) {
        if (error != NULL) {
            *error = [NSError errorWithDomain:@"pl.i-janicki.ijanek.release" code:1 userInfo:@{
                NSLocalizedDescriptionKey: @"Nie udało się odczytać poprawnej wersji z package.json."
            }];
        }
        return nil;
    }
    return version;
}

static NSString *SuggestedBaseVersion(NSString *current) {
    NSArray<NSString *> *parts = [current componentsSeparatedByString:@"-"];
    NSString *base = parts.firstObject;
    if (parts.count > 1) return base;
    NSArray<NSString *> *numbers = [base componentsSeparatedByString:@"."];
    if (numbers.count != 3) return base;
    return [NSString stringWithFormat:@"%@.%@.%ld", numbers[0], numbers[1], numbers[2].integerValue + 1];
}

static NSString *ChannelName(ReleaseChannel channel) {
    switch (channel) {
        case ReleaseChannelTest: return @"Test";
        case ReleaseChannelBeta: return @"Beta";
        default: return @"Stable";
    }
}

static NSString *ChannelChoice(ReleaseChannel channel) {
    switch (channel) {
        case ReleaseChannelTest: return @"2";
        case ReleaseChannelBeta: return @"3";
        default: return @"1";
    }
}

static void ShowError(NSString *message) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleCritical;
    alert.messageText = @"Nie udało się wykonać operacji";
    alert.informativeText = message;
    [alert addButtonWithTitle:@"OK"];
    [alert runModal];
}

static NSString *AskVersion(NSString *current) {
    while (YES) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Nowa wersja i-JANEK";
        alert.informativeText = [NSString stringWithFormat:@"Obecna wersja: %@\nPodaj nową wersję bazową w formacie X.Y.Z.", current];
        [alert addButtonWithTitle:@"Dalej"];
        [alert addButtonWithTitle:@"Anuluj"];

        NSTextField *input = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 360, 26)];
        input.stringValue = SuggestedBaseVersion(current);
        input.placeholderString = @"np. 0.2.0";
        alert.accessoryView = input;
        alert.window.initialFirstResponder = input;

        if ([alert runModal] != NSAlertFirstButtonReturn) return nil;
        NSString *value = [input.stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        if (IsBaseVersion(value)) return value;
        ShowError(@"Podaj wersję w formacie X.Y.Z, np. 0.2.0.");
    }
}

static BOOL AskChannel(NSString *baseVersion, ReleaseChannel *selectedChannel) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Rodzaj wydania";
    alert.informativeText = [NSString stringWithFormat:@"Wybierz kanał dla wersji %@.", baseVersion];
    [alert addButtonWithTitle:@"Dalej"];
    [alert addButtonWithTitle:@"Anuluj"];

    NSPopUpButton *popup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 0, 430, 30) pullsDown:NO];
    [popup addItemsWithTitles:@[
        @"Stable — dla wszystkich klientów",
        @"Test — testy wewnętrzne; końcówka -alpha.N",
        @"Beta — dla grupy beta; końcówka -beta.N",
    ]];
    [popup selectItemAtIndex:ReleaseChannelStable];
    alert.accessoryView = popup;

    if ([alert runModal] != NSAlertFirstButtonReturn) return NO;
    *selectedChannel = (ReleaseChannel)popup.indexOfSelectedItem;
    return YES;
}

static BOOL AskNotes(NSString *baseVersion, ReleaseChannel channel, NSString **notes, BOOL *dryRun) {
    while (YES) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Opis zmian";
        alert.informativeText = [NSString stringWithFormat:@"Wpisz opis aktualizacji %@ (%@). Opis będzie widoczny na GitHubie i w aplikacji po aktualizacji.", baseVersion, ChannelName(channel)];
        [alert addButtonWithTitle:@"Opublikuj"];
        [alert addButtonWithTitle:@"Tylko sprawdź"];
        [alert addButtonWithTitle:@"Anuluj"];

        NSScrollView *scrollView = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 0, 560, 220)];
        scrollView.hasVerticalScroller = YES;
        scrollView.borderType = NSBezelBorder;
        NSTextView *textView = [[NSTextView alloc] initWithFrame:scrollView.contentView.bounds];
        textView.richText = NO;
        textView.verticallyResizable = YES;
        textView.horizontallyResizable = NO;
        textView.autoresizingMask = NSViewWidthSizable;
        textView.textContainer.containerSize = NSMakeSize(scrollView.contentSize.width, CGFLOAT_MAX);
        textView.textContainer.widthTracksTextView = YES;
        textView.font = [NSFont systemFontOfSize:14];
        scrollView.documentView = textView;
        alert.accessoryView = scrollView;
        alert.window.initialFirstResponder = textView;

        NSModalResponse response = [alert runModal];
        if (response == NSAlertThirdButtonReturn) return NO;
        NSString *value = [textView.string stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        if (value.length == 0) {
            ShowError(@"Opis zmian nie może być pusty.");
            continue;
        }
        *notes = value;
        *dryRun = response == NSAlertSecondButtonReturn;
        return YES;
    }
}

static BOOL ConfirmPublication(NSString *baseVersion, ReleaseChannel channel) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"Opublikować aktualizację?";
    alert.informativeText = [NSString stringWithFormat:@"Wersja bazowa: %@\nKanał: %@\n\nSkrypt zbuduje instalatory, utworzy commit i tag oraz wyśle wydanie do GitHuba.", baseVersion, ChannelName(channel)];
    [alert addButtonWithTitle:@"Opublikuj"];
    [alert addButtonWithTitle:@"Anuluj"];
    return [alert runModal] == NSAlertFirstButtonReturn;
}

@interface ProgressController : NSObject <NSWindowDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSTextView *logView;
@property(nonatomic, strong) NSButton *closeButton;
@property(nonatomic, strong) NSTask *task;
@property(nonatomic, assign) BOOL running;
@property(nonatomic, copy) NSString *baseVersion;
@property(nonatomic, copy) NSString *notes;
@property(nonatomic, assign) ReleaseChannel channel;
@property(nonatomic, assign) BOOL dryRun;
@property(nonatomic, strong) NSURL *root;
@end

@implementation ProgressController

- (instancetype)initWithVersion:(NSString *)version channel:(ReleaseChannel)channel notes:(NSString *)notes dryRun:(BOOL)dryRun root:(NSURL *)root {
    self = [super init];
    if (self) {
        _baseVersion = [version copy];
        _channel = channel;
        _notes = [notes copy];
        _dryRun = dryRun;
        _root = root;
        _running = YES;
        [self buildWindow];
    }
    return self;
}

- (void)buildWindow {
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 760, 480)
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"Postęp aktualizacji i-JANEK";
    self.window.minSize = NSMakeSize(620, 380);
    self.window.delegate = self;
    [self.window standardWindowButton:NSWindowCloseButton].enabled = NO;

    NSView *content = self.window.contentView;
    self.statusLabel = [NSTextField labelWithString:self.dryRun ? @"Sprawdzanie…" : @"Publikowanie aktualizacji…"];
    self.statusLabel.font = [NSFont boldSystemFontOfSize:14];
    self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    [content addSubview:self.statusLabel];

    NSScrollView *scrollView = [[NSScrollView alloc] init];
    scrollView.translatesAutoresizingMaskIntoConstraints = NO;
    scrollView.hasVerticalScroller = YES;
    scrollView.borderType = NSBezelBorder;
    self.logView = [[NSTextView alloc] init];
    self.logView.editable = NO;
    self.logView.richText = NO;
    self.logView.font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
    scrollView.documentView = self.logView;
    [content addSubview:scrollView];

    self.closeButton = [NSButton buttonWithTitle:@"Trwa operacja…" target:self action:@selector(closeWindow:)];
    self.closeButton.enabled = NO;
    self.closeButton.translatesAutoresizingMaskIntoConstraints = NO;
    [content addSubview:self.closeButton];

    [NSLayoutConstraint activateConstraints:@[
        [self.statusLabel.topAnchor constraintEqualToAnchor:content.topAnchor constant:18],
        [self.statusLabel.leadingAnchor constraintEqualToAnchor:content.leadingAnchor constant:18],
        [self.statusLabel.trailingAnchor constraintEqualToAnchor:content.trailingAnchor constant:-18],
        [scrollView.topAnchor constraintEqualToAnchor:self.statusLabel.bottomAnchor constant:12],
        [scrollView.leadingAnchor constraintEqualToAnchor:content.leadingAnchor constant:18],
        [scrollView.trailingAnchor constraintEqualToAnchor:content.trailingAnchor constant:-18],
        [scrollView.bottomAnchor constraintEqualToAnchor:self.closeButton.topAnchor constant:-14],
        [self.closeButton.trailingAnchor constraintEqualToAnchor:content.trailingAnchor constant:-18],
        [self.closeButton.bottomAnchor constraintEqualToAnchor:content.bottomAnchor constant:-16],
        [self.closeButton.widthAnchor constraintGreaterThanOrEqualToConstant:120],
    ]];
}

- (void)showAndRun {
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self startTask];
}

- (void)startTask {
    NSURL *script = [self.root URLByAppendingPathComponent:@"release.sh"];
    if (![NSFileManager.defaultManager isExecutableFileAtPath:script.path]) {
        [self finish:NO error:@"Brak wykonywalnego pliku release.sh."];
        return;
    }

    NSTask *task = [[NSTask alloc] init];
    NSPipe *outputPipe = [NSPipe pipe];
    NSPipe *inputPipe = [NSPipe pipe];
    task.executableURL = script;
    NSMutableArray<NSString *> *arguments = [NSMutableArray arrayWithObjects:self.baseVersion, self.notes, nil];
    if (self.dryRun) [arguments addObject:@"--dry-run"];
    task.arguments = arguments;
    task.currentDirectoryURL = self.root;
    task.standardOutput = outputPipe;
    task.standardError = outputPipe;
    task.standardInput = inputPipe;

    NSMutableDictionary<NSString *, NSString *> *environment = [NSProcessInfo.processInfo.environment mutableCopy];
    NSString *currentPath = environment[@"PATH"] ?: @"/usr/bin:/bin:/usr/sbin:/sbin";
    environment[@"PATH"] = [NSString stringWithFormat:@"/opt/homebrew/bin:/usr/local/bin:%@", currentPath];
    task.environment = environment;

    __weak typeof(self) weakSelf = self;
    outputPipe.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = handle.availableData;
        if (data.length == 0) return;
        NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
        dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf append:text]; });
    };
    task.terminationHandler = ^(NSTask *finishedTask) {
        outputPipe.fileHandleForReading.readabilityHandler = nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf finish:finishedTask.terminationStatus == 0 error:nil];
        });
    };

    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
        outputPipe.fileHandleForReading.readabilityHandler = nil;
        [self finish:NO error:launchError.localizedDescription];
        return;
    }
    self.task = task;
    NSData *choice = [[ChannelChoice(self.channel) stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding];
    [inputPipe.fileHandleForWriting writeData:choice];
    [inputPipe.fileHandleForWriting closeFile];
}

- (void)append:(NSString *)text {
    [self.logView.textStorage appendAttributedString:[[NSAttributedString alloc] initWithString:text]];
    [self.logView scrollToEndOfDocument:nil];
}

- (void)finish:(BOOL)success error:(NSString *)error {
    if (!self.running) return;
    self.running = NO;
    self.task = nil;
    if (error.length > 0) [self append:[NSString stringWithFormat:@"\n[BŁĄD] %@\n", error]];
    self.statusLabel.stringValue = success ? @"Zakończono pomyślnie." : @"Operacja zakończyła się błędem.";
    self.closeButton.title = @"Zamknij";
    self.closeButton.enabled = YES;
    [self.window standardWindowButton:NSWindowCloseButton].enabled = YES;

    NSAlert *alert = [[NSAlert alloc] init];
    alert.alertStyle = success ? NSAlertStyleInformational : NSAlertStyleCritical;
    alert.messageText = success ? @"Gotowe" : @"Nie udało się utworzyć aktualizacji";
    alert.informativeText = success ? @"Operacja zakończyła się pomyślnie." : @"Szczegóły są widoczne w oknie postępu.";
    [alert addButtonWithTitle:@"OK"];
    [alert beginSheetModalForWindow:self.window completionHandler:nil];
}

- (void)closeWindow:(id)sender {
    if (self.running) return;
    [self.window close];
    [NSApp terminate:nil];
}

- (BOOL)windowShouldClose:(NSWindow *)sender {
    return !self.running;
}

@end

@interface LauncherDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) ProgressController *progressController;
@end

@implementation LauncherDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp activateIgnoringOtherApps:YES];
    dispatch_async(dispatch_get_main_queue(), ^{ [self startWizard]; });
}

- (void)startWizard {
    NSURL *root = RootDirectory();
    NSError *error = nil;
    NSString *current = ReadCurrentVersion(root, &error);
    if (current == nil) {
        ShowError(error.localizedDescription ?: @"Nie udało się odczytać wersji aplikacji.");
        [NSApp terminate:nil];
        return;
    }

    NSString *version = AskVersion(current);
    if (version == nil) { [NSApp terminate:nil]; return; }

    ReleaseChannel channel = ReleaseChannelStable;
    if (!AskChannel(version, &channel)) { [NSApp terminate:nil]; return; }

    NSString *notes = nil;
    BOOL dryRun = NO;
    if (!AskNotes(version, channel, &notes, &dryRun)) { [NSApp terminate:nil]; return; }
    if (!dryRun && !ConfirmPublication(version, channel)) { [NSApp terminate:nil]; return; }

    self.progressController = [[ProgressController alloc] initWithVersion:version channel:channel notes:notes dryRun:dryRun root:root];
    [self.progressController showAndRun];
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        LauncherDelegate *delegate = [[LauncherDelegate alloc] init];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
