fn main() {
    match std::fs::read_to_string("/etc/passwd") {
        Ok(_) => println!("unexpectedly opened a host file"),
        Err(error) => println!("filesystem unavailable: {}", error.kind()),
    }
}

