namespace ExpenseTrackerApi.Dtos;
public record ExpenseResponse(int Id, string Title, decimal Amount, string Category, DateOnly Date);
